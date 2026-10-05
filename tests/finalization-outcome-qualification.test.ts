import { describe, expect, it } from 'vitest';
import {
  type ExternalCoverage,
  FixtureRetainedBinding,
  NonLiveFinalizationHost,
} from './fixtures/finalization-outcome-model.js';

function host() {
  return new NonLiveFinalizationHost(new FixtureRetainedBinding());
}

describe('non-live finalization outcome contract', () => {
  it('F01: host invokes pure validation inside its boundary, then commits and delivers', () => {
    const model = host();
    const record = model.approve('retained');
    expect(model.finalize(record, 10, 'acknowledged')).toBe('committed');
    expect(model.observe(record).trace).toEqual([
      'host:enter-boundary',
      'host:invoke-pure-validator',
      'host:paired-symbolic-commit',
      'host:leave-boundary',
    ]);
    expect(model.observe(record).delivered).toBe(false);
    model.deliver(record);
    expect(model.observe(record).delivered).toBe(true);
    expect(() => model.deliver(record)).toThrow('delivery_not_eligible');
    expect(() => model.finalize(record, 10, 'acknowledged')).toThrow(
      'attempt_not_open',
    );
  });

  it('F02: validation is deterministic and does not mutate caller material', () => {
    const validator = new FixtureRetainedBinding();
    const input = Object.freeze({
      material: 'a',
      localPreview: 'a',
      issuerConsent: 'a',
      now: 10,
    });
    expect(validator.validate(input)).toBeUndefined();
    expect(validator.validate(input)).toBeUndefined();
    expect(input).toEqual({
      material: 'a',
      localPreview: 'a',
      issuerConsent: 'a',
      now: 10,
    });
  });

  it.each([
    'local-preview',
    'issuer',
  ] as const)('F03: rejects drift in %s without symbolic publication', (decision) => {
    const model = host();
    const record = model.approve(
      'a',
      decision === 'local-preview' ? 'b' : 'a',
      decision === 'issuer' ? 'b' : 'a',
    );
    expect(model.finalize(record, 10, 'acknowledged')).toBe('rejected');
    expect(model.observe(record).phase).toBe('closed');
    expect(model.observe(record).trace).not.toContain(
      'host:paired-symbolic-commit',
    );
    expect(() => model.deliver(record)).toThrow('delivery_not_eligible');
  });

  it('F04: copied/foreign references cannot choose a record or attempt', () => {
    const model = host();
    const record = model.approve('a');
    for (const forged of [
      {},
      { attempt: model.observe(record).attempt },
      host().approve('a'),
    ])
      expect(() => model.finalize(forged, 10, 'acknowledged')).toThrow(
        'untrusted_record_reference',
      );
  });

  it('F05: lost commit acknowledgement freezes by stable key until confirmed revocation', () => {
    const model = host();
    const record = model.approve('a');
    const attempt = model.observe(record).attempt;
    expect(model.finalize(record, 10, 'lost-after-commit')).toBe('unknown');
    expect(model.reconcile(record, 'authoritative')).toBe('committed-frozen');
    expect(model.observe(record).attempt).toBe(attempt);
    expect(() => model.deliver(record)).toThrow('delivery_not_eligible');
    expect(() => model.finalize(record, 10, 'acknowledged')).toThrow(
      'attempt_not_open',
    );
    expect(() => model.replace(record, 'fresh')).toThrow('replacement_blocked');
    model.confirmRevocation(record);
    const replacement = model.replace(record, 'fresh');
    expect(model.observe(replacement).attempt).not.toBe(attempt);
    expect(model.finalize(replacement, 11, 'acknowledged')).toBe('committed');
    expect(() => model.deliver(record)).toThrow('delivery_not_eligible');
  });

  it('F06: authoritative no-commit closes the old attempt without retry or remint', () => {
    const model = host();
    const record = model.approve('a');
    expect(model.finalize(record, 10, 'lost-before-commit')).toBe('unknown');
    expect(model.reconcile(record, 'authoritative')).toBe('no-commit-closed');
    expect(() => model.finalize(record, 10, 'acknowledged')).toThrow(
      'attempt_not_open',
    );
    expect(() => model.deliver(record)).toThrow('delivery_not_eligible');
    expect(
      model.finalize(model.replace(record, 'fresh'), 11, 'acknowledged'),
    ).toBe('committed');
  });

  it.each([
    'stale',
    'unavailable',
  ] as const)('F07: %s reads never clear quarantine', (read) => {
    const model = host();
    const record = model.approve('a');
    model.finalize(record, 10, 'lost-before-commit');
    expect(model.reconcile(record, read)).toBe('unknown');
    expect(model.observe(record).quarantined).toBe(true);
    expect(() => model.replace(record, 'fresh')).toThrow('replacement_blocked');
  });

  it.each([
    false,
    true,
  ])('F08: pending transaction may later commit (%s); early read cannot settle it', (committed) => {
    const model = host();
    const record = model.approve('a');
    expect(model.finalize(record, 10, 'pending')).toBe('unknown');
    expect(model.reconcile(record, 'authoritative')).toBe('unknown');
    expect(() => model.replace(record, 'fresh')).toThrow('replacement_blocked');
    model.settle(record, committed);
    expect(model.reconcile(record, 'authoritative')).toBe(
      committed ? 'committed-frozen' : 'no-commit-closed',
    );
    expect(() => model.deliver(record)).toThrow('delivery_not_eligible');
  });

  it('F09: quarantine does not block a fixture-declared independent record', () => {
    const model = host();
    const affected = model.approve('affected');
    const independent = model.approve('independent');
    model.finalize(affected, 10, 'pending');
    expect(model.finalize(independent, 10, 'acknowledged')).toBe('committed');
    model.deliver(independent);
    expect(model.observe(affected).quarantined).toBe(true);
    expect(() => model.replace(affected, 'fresh')).toThrow(
      'replacement_blocked',
    );
  });

  it('F10: external ordering coverage fits the same finalization shape', () => {
    const model = host();
    model.setExternalRevision(7);
    const record = model.approve('a');
    const coverage = Object.freeze({
      kind: 'ordered' as const,
      revision: 7,
      validUntil: 20,
    });
    expect(model.finalize(record, 10, 'acknowledged', coverage)).toBe(
      'committed',
    );
    expect(coverage).toEqual({ kind: 'ordered', revision: 7, validUntil: 20 });
  });

  it('F12: an ancestor cannot fork a replacement around descendant quarantine', () => {
    const model = host();
    const original = model.approve('a', 'wrong-preview');
    expect(model.finalize(original, 10, 'acknowledged')).toBe('rejected');
    const affected = model.replace(original, 'fresh');
    expect(model.finalize(affected, 11, 'pending')).toBe('unknown');
    expect(() => model.replace(original, 'bypass')).toThrow(
      'replacement_blocked',
    );
    expect(() => model.replace(affected, 'bypass')).toThrow(
      'replacement_blocked',
    );
    const independent = model.approve('independent');
    expect(model.finalize(independent, 12, 'acknowledged')).toBe('committed');
    expect(model.observe(affected).quarantined).toBe(true);
  });

  it.each([
    false,
    true,
  ])('F13: resolved descendant (%s) allows only the lineage head to replace', (committed) => {
    const model = host();
    const original = model.approve('a', 'wrong-preview');
    model.finalize(original, 10, 'acknowledged');
    const affected = model.replace(original, 'fresh');
    // Do not create a sibling even before the head attempts finalization.
    expect(() => model.replace(original, 'sibling')).toThrow(
      'replacement_blocked',
    );
    model.finalize(affected, 11, 'pending');
    model.settle(affected, committed);
    expect(model.reconcile(affected, 'authoritative')).toBe(
      committed ? 'committed-frozen' : 'no-commit-closed',
    );
    if (committed) {
      expect(() => model.replace(affected, 'fresh-again')).toThrow(
        'replacement_blocked',
      );
      model.confirmRevocation(affected);
    }
    expect(() => model.replace(original, 'ancestor-bypass')).toThrow(
      'replacement_blocked',
    );
    const replacement = model.replace(affected, 'fresh-again');
    expect(model.finalize(replacement, 12, 'acknowledged')).toBe('committed');
    expect(() => model.replace(affected, 'sibling')).toThrow(
      'replacement_blocked',
    );
  });

  it.each<ExternalCoverage | undefined>([
    undefined,
    { kind: 'unfenced' },
    { kind: 'unavailable' },
    { kind: 'ordered', revision: 8, validUntil: 20 },
    { kind: 'ordered', revision: 7, validUntil: 10 },
    { kind: 'ordered', revision: 7, validUntil: 9 },
  ])('F11: missing, lost, drifted or expired external coverage rejects: %j', (coverage) => {
    const model = host();
    model.setExternalRevision(7);
    const record = model.approve('a');
    expect(model.finalize(record, 10, 'acknowledged', coverage)).toBe(
      'rejected',
    );
    expect(model.observe(record).trace).not.toContain(
      'host:paired-symbolic-commit',
    );
    expect(() => model.deliver(record)).toThrow('delivery_not_eligible');
  });

  it('F14: replacement captures current external revision instead of stale predecessor revision', () => {
    const model = host();
    model.setExternalRevision(7);
    const original = model.approve('original');
    model.setExternalRevision(8);
    expect(
      model.finalize(original, 10, 'acknowledged', {
        kind: 'ordered',
        revision: 8,
        validUntil: 20,
      }),
    ).toBe('rejected');
    const replacement = model.replace(original, 'fresh');
    expect(
      model.finalize(replacement, 11, 'acknowledged', {
        kind: 'ordered',
        revision: 8,
        validUntil: 21,
      }),
    ).toBe('committed');
    const stale = model.approve('stale');
    expect(
      model.finalize(stale, 11, 'acknowledged', {
        kind: 'ordered',
        revision: 7,
        validUntil: 21,
      }),
    ).toBe('rejected');
  });
});
