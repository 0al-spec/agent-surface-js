import { describe, expect, it } from 'vitest';
import {
  type FixtureConsent,
  type FixtureReference,
  HOST_CONTRACT_MATERIALS,
  NonLiveHostIssuanceContractModel,
} from './fixtures/host-issuance-contract-model.js';

function approved(
  model: NonLiveHostIssuanceContractModel,
  options: { localBinding?: string; issuerBinding?: string } = {},
) {
  const reference = model.approveCurrentMaterial();
  const localPreview = model.recordConsent(
    reference,
    'local-preview',
    options.localBinding,
  );
  const issuer = model.recordConsent(
    reference,
    'issuer',
    options.issuerBinding,
  );
  return { reference, decisions: { localPreview, issuer } };
}

function expectNoAuthorityPublication(model: NonLiveHostIssuanceContractModel) {
  const observation = model.observe();
  expect(observation.symbolicCommitCount).toBe(0);
  expect(observation.symbolicVerifierEligibilityCount).toBe(0);
  expect(observation.privateDeliveryAttemptCount).toBe(0);
  expect(observation.confirmedPrivateDeliveryCount).toBe(0);
}

describe('non-live host issuance contract qualification model', () => {
  it('symbolically commits once, then records private delivery separately', () => {
    const model = new NonLiveHostIssuanceContractModel();
    const { reference, decisions } = approved(model);

    model.commit(reference, decisions);
    expect(model.observe(reference)).toMatchObject({
      symbolicCommitCount: 1,
      symbolicVerifierEligibilityCount: 1,
      privateDeliveryAttemptCount: 0,
      confirmedPrivateDeliveryCount: 0,
      recordStatus: 'committed',
      recordConsumed: true,
    });

    model.deliverPrivately(reference, 'acknowledged');
    expect(model.observe(reference)).toMatchObject({
      symbolicCommitCount: 1,
      symbolicVerifierEligibilityCount: 1,
      privateDeliveryAttemptCount: 1,
      confirmedPrivateDeliveryCount: 1,
      recordStatus: 'delivered',
    });
    expect(model.observe(reference).trace).toEqual([
      'record-approved-symbolically',
      'consent-recorded:local-preview',
      'consent-recorded:issuer',
      'symbolic-grant-and-verifier-eligibility-committed',
      'private-symbolic-delivery-acknowledged',
    ]);
  });

  it.each([
    'principal',
    'runtime',
  ] as const)('rejects a missing trusted %s before symbolic commit', (material) => {
    const model = new NonLiveHostIssuanceContractModel();
    model.setActive(material, false);
    const { reference, decisions } = approved(model);

    expect(() => model.commit(reference, decisions)).toThrow();
    expect(model.observe(reference).recordStatus).toBe('invalidated');
    expectNoAuthorityPublication(model);
  });

  it('rejects a copied ID, JSON round-trip, type-cast object, or foreign authority reference', () => {
    const firstHost = new NonLiveHostIssuanceContractModel();
    const secondHost = new NonLiveHostIssuanceContractModel();
    const first = approved(firstHost);
    const foreign = approved(secondHost);
    const copiedId = { id: (first.reference as { id: string }).id };
    const jsonCopy = JSON.parse(JSON.stringify(first.reference)) as object;
    const typeCastCopy = { ...(first.reference as object) } as FixtureReference;

    for (const forged of [copiedId, jsonCopy, typeCastCopy]) {
      expect(() => firstHost.commit(forged, first.decisions)).toThrow(
        /^untrusted_fixture_reference$/,
      );
    }
    expect(() =>
      firstHost.commit(foreign.reference, foreign.decisions),
    ).toThrow(/^untrusted_fixture_reference$/);
    expectNoAuthorityPublication(firstHost);
    expectNoAuthorityPublication(secondHost);
  });

  it('requires both distinct decisions and rejects copied, swapped, or wrong-material decisions', () => {
    const model = new NonLiveHostIssuanceContractModel();
    const first = approved(model);

    expect(() =>
      model.commit(first.reference, {
        localPreview: first.decisions.localPreview,
      }),
    ).toThrow(/^both_consent_decisions_required$/);
    expect(model.observe(first.reference).recordStatus).toBe('invalidated');

    const swappedModel = new NonLiveHostIssuanceContractModel();
    const swapped = approved(swappedModel);
    expect(() =>
      swappedModel.commit(swapped.reference, {
        localPreview: swapped.decisions.issuer,
        issuer: swapped.decisions.localPreview,
      }),
    ).toThrow(/^consent_reference_mismatch$/);
    expectNoAuthorityPublication(swappedModel);

    const foreign = approved(model);
    const target = approved(model);
    const foreignDecision: FixtureConsent = foreign.decisions.localPreview;
    expect(() =>
      model.commit(target.reference, {
        localPreview: foreignDecision,
        issuer: target.decisions.issuer,
      }),
    ).toThrow(/^consent_reference_mismatch$/);
    expectNoAuthorityPublication(model);

    const copiedConsentModel = new NonLiveHostIssuanceContractModel();
    const copiedConsent = approved(copiedConsentModel);
    const consentCopy = JSON.parse(
      JSON.stringify(copiedConsent.decisions.localPreview),
    ) as FixtureConsent;
    expect(() =>
      copiedConsentModel.commit(copiedConsent.reference, {
        localPreview: consentCopy,
        issuer: copiedConsent.decisions.issuer,
      }),
    ).toThrow(/^both_consent_decisions_required$/);
    expectNoAuthorityPublication(copiedConsentModel);

    for (const options of [
      { localBinding: 'a-different-preview-binding' },
      { issuerBinding: 'a-different-issuer-binding' },
    ]) {
      const wrongMaterialModel = new NonLiveHostIssuanceContractModel();
      const wrongMaterial = approved(wrongMaterialModel, options);
      expect(() =>
        wrongMaterialModel.commit(
          wrongMaterial.reference,
          wrongMaterial.decisions,
        ),
      ).toThrow(/^consent_material_mismatch$/);
      expectNoAuthorityPublication(wrongMaterialModel);
    }
  });

  it.each([
    'local-preview',
    'issuer',
  ] as const)('rejects when the %s consent is missing', (missing) => {
    const model = new NonLiveHostIssuanceContractModel();
    const { reference, decisions } = approved(model);
    const supplied =
      missing === 'local-preview'
        ? { issuer: decisions.issuer }
        : { localPreview: decisions.localPreview };

    expect(() => model.commit(reference, supplied)).toThrow(
      /^both_consent_decisions_required$/,
    );
    expect(model.observe(reference).recordStatus).toBe('invalidated');
    expectNoAuthorityPublication(model);
  });

  it('treats precommit consent withdrawal as terminal and rechecks it after interleaving', () => {
    const withdrawn = new NonLiveHostIssuanceContractModel();
    const first = approved(withdrawn);
    withdrawn.withdrawConsent(first.decisions.localPreview);
    expect(() => withdrawn.commit(first.reference, first.decisions)).toThrow();
    expect(() =>
      withdrawn.recordConsent(first.reference, 'local-preview'),
    ).toThrow(/^approved_record_not_open$/);
    expectNoAuthorityPublication(withdrawn);

    const race = new NonLiveHostIssuanceContractModel();
    const second = approved(race);
    expect(() =>
      race.commit(second.reference, second.decisions, (point) => {
        if (point === 'before-linearization') {
          race.withdrawConsent(second.decisions.issuer);
        }
      }),
    ).toThrow();
    expect(race.observe(second.reference).recordStatus).toBe('invalidated');
    expectNoAuthorityPublication(race);
  });

  it.each(
    HOST_CONTRACT_MATERIALS,
  )('invalidates old consent after %s revision drift', (material) => {
    const model = new NonLiveHostIssuanceContractModel();
    const { reference, decisions } = approved(model);
    model.invalidate(material);

    expect(() => model.commit(reference, decisions)).toThrow();
    expect(model.observe(reference).recordStatus).toBe('invalidated');
    expectNoAuthorityPublication(model);
  });

  it.each(
    HOST_CONTRACT_MATERIALS,
  )('rejects when the %s validity deadline expires after consent', (material) => {
    const model = new NonLiveHostIssuanceContractModel();
    for (const candidate of HOST_CONTRACT_MATERIALS) {
      model.setDeadline(candidate, candidate === material ? 100 : 1_000);
    }
    const { reference, decisions } = approved(model);
    model.advanceTo(101);

    expect(() => model.commit(reference, decisions)).toThrow(
      `material_invalidated:${material}`,
    );
    expect(model.observe(reference).recordStatus).toBe('invalidated');
    expectNoAuthorityPublication(model);
  });

  it('fails closed for an active external identity source without ordering, despite revision and future deadline', () => {
    const model = new NonLiveHostIssuanceContractModel();
    model.markIdentityAsExternal(false);
    const { reference, decisions } = approved(model);

    expect(() => model.commit(reference, decisions)).toThrow(
      /^external_identity_ordering_unqualified$/,
    );
    expect(model.observe(reference).recordStatus).toBe('invalidated');
    expectNoAuthorityPublication(model);
  });

  it('rechecks external ordering at the linearization boundary after interleaving', () => {
    const model = new NonLiveHostIssuanceContractModel();
    const { reference, decisions } = approved(model);
    expect(() =>
      model.commit(reference, decisions, (point) => {
        if (point === 'before-linearization')
          model.markIdentityAsExternal(false);
      }),
    ).toThrow(/^external_identity_ordering_unqualified$/);
    expect(model.observe(reference).recordStatus).toBe('invalidated');
    expectNoAuthorityPublication(model);
  });

  it('permits an external identity only when the fixture assumes a qualified ordering contract', () => {
    const model = new NonLiveHostIssuanceContractModel();
    // This flag is an assumption in the fake, not evidence that a real source
    // participates in a host's commit fence.
    model.markIdentityAsExternal(true);
    const { reference, decisions } = approved(model);
    model.commit(reference, decisions);
    expect(model.observe(reference)).toMatchObject({
      symbolicCommitCount: 1,
      recordStatus: 'committed',
    });
  });

  it('orders invalidation-before-commit as reject, but commit-before-invalidation as committed authority requiring revocation', () => {
    const beforeModel = new NonLiveHostIssuanceContractModel();
    const before = approved(beforeModel);
    expect(() =>
      beforeModel.commit(before.reference, before.decisions, (point) => {
        if (point === 'before-linearization') beforeModel.invalidate('policy');
      }),
    ).toThrow();
    expectNoAuthorityPublication(beforeModel);

    const afterModel = new NonLiveHostIssuanceContractModel();
    const after = approved(afterModel);
    afterModel.commit(after.reference, after.decisions, (point) => {
      if (point === 'after-linearization') afterModel.invalidate('identity');
    });
    expect(afterModel.observe(after.reference)).toMatchObject({
      symbolicCommitCount: 1,
      symbolicVerifierEligibilityCount: 1,
      privateDeliveryAttemptCount: 0,
      recordStatus: 'committed',
      recordNeedsRevocation: true,
    });
    expect(() =>
      afterModel.deliverPrivately(after.reference, 'acknowledged'),
    ).toThrow(/^symbolic_delivery_not_eligible$/);
    afterModel.confirmRevocation(after.reference);
    expect(afterModel.observe(after.reference)).toMatchObject({
      symbolicCommitCount: 1,
      confirmedRevocationCount: 1,
      recordStatus: 'revoked',
      recordNeedsRevocation: false,
    });
  });

  it('allows one issuance attempt per record under deterministic promise replay scheduling', async () => {
    const model = new NonLiveHostIssuanceContractModel();
    const { reference, decisions } = approved(model);
    // This synchronous fixture runs the two promise jobs in sequence; this is
    // replay evidence only, not a concurrent database/serializability test.
    const attempts = await Promise.allSettled([
      Promise.resolve().then(() => model.commit(reference, decisions)),
      Promise.resolve().then(() => model.commit(reference, decisions)),
    ]);

    expect(
      attempts.filter((attempt) => attempt.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      attempts.filter((attempt) => attempt.status === 'rejected'),
    ).toHaveLength(1);
    expect(model.observe(reference)).toMatchObject({
      symbolicCommitCount: 1,
      symbolicVerifierEligibilityCount: 1,
      privateDeliveryAttemptCount: 0,
      recordConsumed: true,
    });
    expect(() => model.commit(reference, decisions)).toThrow(
      /^approved_record_not_open$/,
    );
  });

  it('rejects a reentrant competing attempt at the simulated linearization boundary', () => {
    const model = new NonLiveHostIssuanceContractModel();
    const { reference, decisions } = approved(model);
    let competitorError: unknown;
    model.commit(reference, decisions, (point) => {
      if (point !== 'before-linearization') return;
      try {
        model.commit(reference, decisions);
      } catch (error) {
        competitorError = error;
      }
    });

    expect(competitorError).toBeInstanceOf(Error);
    expect((competitorError as Error).message).toBe('approved_record_not_open');
    expect(model.observe(reference)).toMatchObject({
      symbolicCommitCount: 1,
      symbolicVerifierEligibilityCount: 1,
      privateDeliveryAttemptCount: 0,
    });
  });

  it('makes a failed symbolic commit attempt terminal without partial counters or delivery', () => {
    const model = new NonLiveHostIssuanceContractModel();
    const { reference, decisions } = approved(model);
    expect(() =>
      model.commit(reference, decisions, (point) => {
        if (point === 'before-linearization') throw new Error('store_refused');
      }),
    ).toThrow(/^store_refused$/);
    expect(model.observe(reference).recordStatus).toBe('invalidated');
    expectNoAuthorityPublication(model);
    expect(() => model.commit(reference, decisions)).toThrow(
      /^approved_record_not_open$/,
    );
  });

  it('freezes a post-linearization uncertain return without erasing the committed effects', () => {
    const model = new NonLiveHostIssuanceContractModel();
    const first = approved(model);
    expect(() =>
      model.commit(first.reference, first.decisions, (point) => {
        if (point === 'after-linearization') throw new Error('ack_lost');
      }),
    ).toThrow(/^ack_lost$/);
    expect(model.observe(first.reference)).toMatchObject({
      symbolicCommitCount: 1,
      symbolicVerifierEligibilityCount: 1,
      privateDeliveryAttemptCount: 0,
      recordStatus: 'frozen',
      recordConsumed: true,
      recordNeedsRevocation: true,
    });
    expect(() => model.commit(first.reference, first.decisions)).toThrow();
    expect(() =>
      model.deliverPrivately(first.reference, 'acknowledged'),
    ).toThrow(/^symbolic_delivery_not_eligible$/);
    expect(() => model.approveCurrentMaterial()).toThrow(
      /^symbolic_authority_frozen_pending_revocation$/,
    );
    model.confirmRevocation(first.reference);
    const fresh = approved(model);
    model.commit(fresh.reference, fresh.decisions);
    expect(model.observe(fresh.reference).symbolicCommitCount).toBe(2);
  });

  it('freezes uncertain delivery, requires confirmed revocation, and never remints from the consumed record', () => {
    const model = new NonLiveHostIssuanceContractModel();
    const first = approved(model);
    model.commit(first.reference, first.decisions);
    model.deliverPrivately(first.reference, 'uncertain');

    expect(model.observe(first.reference)).toMatchObject({
      symbolicCommitCount: 1,
      symbolicVerifierEligibilityCount: 1,
      privateDeliveryAttemptCount: 1,
      confirmedPrivateDeliveryCount: 0,
      recordStatus: 'frozen',
      recordNeedsRevocation: true,
    });
    expect(() => model.approveCurrentMaterial()).toThrow(
      /^symbolic_authority_frozen_pending_revocation$/,
    );
    expect(() => model.commit(first.reference, first.decisions)).toThrow();
    expect(() =>
      model.deliverPrivately(first.reference, 'acknowledged'),
    ).toThrow(/^symbolic_delivery_not_eligible$/);
    expect(model.observe(first.reference)).toMatchObject({
      privateDeliveryAttemptCount: 1,
      confirmedPrivateDeliveryCount: 0,
      recordStatus: 'frozen',
    });
    expectNoAdditionalCommit(model, 1);

    model.confirmRevocation(first.reference);
    expect(() => model.commit(first.reference, first.decisions)).toThrow();
    const fresh = approved(model);
    model.commit(fresh.reference, fresh.decisions);
    expect(model.observe(fresh.reference)).toMatchObject({
      symbolicCommitCount: 2,
      symbolicVerifierEligibilityCount: 2,
      recordStatus: 'committed',
    });
  });

  it('retains frozen state until revocation across restart and blocks unsupported recovery', () => {
    const retained = new NonLiveHostIssuanceContractModel();
    const pending = approved(retained);
    retained.commit(pending.reference, pending.decisions);
    retained.deliverPrivately(pending.reference, 'uncertain');
    retained.recoverAfterRestart('retain-state');
    expect(() => retained.approveCurrentMaterial()).toThrow(
      /^symbolic_authority_frozen_pending_revocation$/,
    );
    retained.confirmRevocation(pending.reference);
    const afterRevocation = approved(retained);
    retained.commit(afterRevocation.reference, afterRevocation.decisions);
    expect(
      retained.observe(afterRevocation.reference).symbolicCommitCount,
    ).toBe(2);

    const unsupported = new NonLiveHostIssuanceContractModel();
    unsupported.recoverAfterRestart('unsupported');
    expect(() => unsupported.approveCurrentMaterial()).toThrow(
      /^restart_recovery_unsupported$/,
    );
    expectNoAuthorityPublication(unsupported);
  });

  it('freezes a committed but undelivered record after retained-state restart', () => {
    const model = new NonLiveHostIssuanceContractModel();
    const pendingDelivery = approved(model);
    model.commit(pendingDelivery.reference, pendingDelivery.decisions);

    model.recoverAfterRestart('retain-state');

    expect(model.observe(pendingDelivery.reference)).toMatchObject({
      symbolicCommitCount: 1,
      recordStatus: 'frozen',
      recordConsumed: true,
      recordNeedsRevocation: true,
    });
    expect(() =>
      model.deliverPrivately(pendingDelivery.reference, 'acknowledged'),
    ).toThrow(/^symbolic_delivery_not_eligible$/);
    expect(() => model.approveCurrentMaterial()).toThrow(
      /^symbolic_authority_frozen_pending_revocation$/,
    );

    model.confirmRevocation(pendingDelivery.reference);
    const fresh = approved(model);
    model.commit(fresh.reference, fresh.decisions);
    expect(model.observe(fresh.reference).symbolicCommitCount).toBe(2);
  });

  it('keeps retained delivered records in the invalidation/revocation fence after restart', () => {
    const model = new NonLiveHostIssuanceContractModel();
    const delivered = approved(model);
    model.commit(delivered.reference, delivered.decisions);
    model.deliverPrivately(delivered.reference, 'acknowledged');
    model.recoverAfterRestart('retain-state');
    model.invalidate('policy');

    expect(model.observe(delivered.reference)).toMatchObject({
      symbolicCommitCount: 1,
      confirmedPrivateDeliveryCount: 1,
      recordStatus: 'delivered',
      recordNeedsRevocation: true,
    });
    expect(() => model.approveCurrentMaterial()).toThrow(
      /^symbolic_authority_frozen_pending_revocation$/,
    );
    model.confirmRevocation(delivered.reference);
    expect(model.observe(delivered.reference).recordStatus).toBe('revoked');
  });

  it.each([
    'committed',
    'delivered',
  ] as const)('requires normal revocation after %s consent withdrawal', (state) => {
    const model = new NonLiveHostIssuanceContractModel();
    const record = approved(model);
    model.commit(record.reference, record.decisions);
    if (state === 'delivered') {
      model.deliverPrivately(record.reference, 'acknowledged');
    }
    model.withdrawConsent(record.decisions.issuer);

    expect(model.observe(record.reference).recordNeedsRevocation).toBe(true);
    expect(() =>
      model.deliverPrivately(record.reference, 'acknowledged'),
    ).toThrow(/^symbolic_delivery_not_eligible$/);
    expect(() => model.approveCurrentMaterial()).toThrow(
      /^symbolic_authority_frozen_pending_revocation$/,
    );
    model.confirmRevocation(record.reference);
    const fresh = approved(model);
    model.commit(fresh.reference, fresh.decisions);
    expect(model.observe(fresh.reference).symbolicCommitCount).toBe(2);
  });

  it('symbolically invalidates every old committed record under the all-old-epoch restart policy', () => {
    const model = new NonLiveHostIssuanceContractModel();
    const old = approved(model);
    model.commit(old.reference, old.decisions);
    model.deliverPrivately(old.reference, 'acknowledged');
    model.recoverAfterRestart('retain-state');
    const middle = approved(model);
    model.commit(middle.reference, middle.decisions);
    model.deliverPrivately(middle.reference, 'acknowledged');
    model.recoverAfterRestart('invalidate-old-epoch');

    expect(model.observe(old.reference)).toMatchObject({
      symbolicCommitCount: 2,
      symbolicVerifierEligibilityCount: 2,
      confirmedPrivateDeliveryCount: 2,
      confirmedRevocationCount: 0,
      symbolicEpochInvalidationCount: 2,
      recordStatus: 'epoch-invalidated',
    });
    expect(model.observe(middle.reference)).toMatchObject({
      symbolicEpochInvalidationCount: 2,
      recordStatus: 'epoch-invalidated',
    });
    const current = approved(model);
    model.commit(current.reference, current.decisions);
    expect(model.observe(current.reference).symbolicCommitCount).toBe(3);
  });
});

function expectNoAdditionalCommit(
  model: NonLiveHostIssuanceContractModel,
  commitCount: number,
) {
  expect(model.observe().symbolicCommitCount).toBe(commitCount);
  expect(model.observe().symbolicVerifierEligibilityCount).toBe(commitCount);
}
