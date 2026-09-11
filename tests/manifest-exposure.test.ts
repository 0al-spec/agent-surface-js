import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  JsonDocument,
  ManifestExposureDeclarations,
  SurfaceSnapshot,
} from '../src/index.js';

// Exposure inventory only, deliberately NOT a complete or operational manifest.
const exposure = {
  classes: ['application.result'],
  redaction: { mode: 'none' },
  retention: { mode: 'user_managed' },
};
const inventory = {
  data_classes: [
    {
      id: 'application.result',
      classification: 'private',
      label: 'Application result',
      description: 'Application-owned result data.',
    },
  ],
  resources: [{ id: 'result', data_exposure: exposure }],
  actions: [{ id: 'result', data_exposure: exposure }],
  events: [
    {
      id: 'grant.revoked',
      control: true,
      data_exposure: {
        classes: [],
        redaction: { mode: 'none' },
        retention: { mode: 'transient', delete_on_grant_end: true },
      },
    },
  ],
};

describe('manifest exposure declarations, not full manifest validation', () => {
  it('parses one catalog per validation pass, not once per source', () => {
    const dataClasses = Array.from({ length: 64 }, (_, index) => ({
      id: `class.${String(index).padStart(3, '0')}`,
      classification: 'private',
      label: 'Result',
      description: 'Application result.',
    }));
    const sources = Array.from({ length: 32 }, (_, index) => ({
      id: `source.${index}`,
      data_exposure: {
        ...exposure,
        classes: index % 2 === 0 ? [] : ['class.000'],
      },
    }));
    const document = new JsonDocument(
      JSON.stringify({
        data_classes: dataClasses,
        resources: sources,
        actions: sources,
        events: sources,
      }),
    );
    const checker = new ManifestExposureDeclarations(document);
    const parse = vi.spyOn(JsonDocument.prototype, 'parse');
    try {
      for (let pass = 1; pass <= 2; pass += 1) {
        checker.validate();
        const catalogParses = parse.mock.results.filter(
          (result) =>
            result.type === 'return' &&
            Array.isArray(result.value) &&
            result.value.length === 64 &&
            result.value[0]?.classification === 'private',
        );
        expect(catalogParses).toHaveLength(pass);
      }
    } finally {
      parse.mockRestore();
    }
    expect(document.parse()).toEqual({
      data_classes: dataClasses,
      resources: sources,
      actions: sources,
      events: sources,
    });
  });

  it('checks every source kind including unscoped control events without choosing authority', () => {
    const document = new JsonDocument(JSON.stringify(inventory));
    expect(
      new ManifestExposureDeclarations(document).validate(),
    ).toBeUndefined();
    // Identities are namespaced by source kind, not globally deduplicated.
    expect(inventory.resources[0]?.id).toBe(inventory.actions[0]?.id);
  });

  it('allows an explicit empty inventory without claiming proposal-only conformance', () => {
    const document = new JsonDocument(
      '{"data_classes":[],"resources":[],"actions":[],"events":[]}',
    );
    expect(
      new ManifestExposureDeclarations(document).validate(),
    ).toBeUndefined();
  });

  it.each([
    'data_classes',
    'resources',
    'actions',
    'events',
  ])('requires the %s array instead of guessing coverage', (member) => {
    for (const replacement of [undefined, null, {}, 'items']) {
      const changed = { ...inventory, [member]: replacement };
      expect(() =>
        new ManifestExposureDeclarations(
          new JsonDocument(JSON.stringify(changed)),
        ).validate(),
      ).toThrow('invalid_manifest_exposure');
    }
  });

  it.each([
    'resources',
    'actions',
    'events',
  ])('does not skip missing exposure on %s', (kind) => {
    const changed = { ...inventory, [kind]: [{ id: 'source', control: true }] };
    expect(() =>
      new ManifestExposureDeclarations(
        new JsonDocument(JSON.stringify(changed)),
      ).validate(),
    ).toThrow('invalid_manifest_exposure');
  });

  it.each([
    'resources',
    'actions',
    'events',
  ])('rejects malformed or ambiguous source identity in %s', (kind) => {
    for (const sources of [
      [null],
      [{}],
      [{ id: '' }],
      [{ id: 3 }],
      [inventory.actions[0], inventory.actions[0]],
    ]) {
      expect(() =>
        new ManifestExposureDeclarations(
          new JsonDocument(JSON.stringify({ ...inventory, [kind]: sources })),
        ).validate(),
      ).toThrow('invalid_manifest_exposure');
    }
  });

  it.each([
    'resources',
    'actions',
    'events',
  ])('validates exposure on all %s, not only grant-selected declarations', (kind) => {
    const changed = {
      ...inventory,
      [kind]: [
        {
          id: 'excluded-by-a-later-grant',
          data_exposure: {
            ...exposure,
            classes: ['undeclared'],
          },
        },
      ],
    };
    expect(() =>
      new ManifestExposureDeclarations(
        new JsonDocument(JSON.stringify(changed)),
      ).validate(),
    ).toThrow('invalid_data_exposure');
  });

  it('parses the whole original document before extraction, including uninspected members', () => {
    const text = JSON.stringify(inventory).replace(
      /}$/,
      ',"auth":{"token":"first","token":"secret-sentinel"}}',
    );
    const check = new ManifestExposureDeclarations(new JsonDocument(text));
    expect(() => check.validate()).toThrow(/^duplicate_json_member$/);
  });

  it('preserves immutable source bytes and extra manifest members through independent hashing', () => {
    const original = { ...inventory, extension: { note: 'retained' } };
    const document = new JsonDocument(JSON.stringify(original));
    const hash = new SurfaceSnapshot(document).hash();
    const checker = new ManifestExposureDeclarations(document);
    expect(checker.validate()).toBeUndefined();
    expect(checker.validate()).toBeUndefined();
    expect(document.parse()).toEqual(original);
    expect(new SurfaceSnapshot(document).hash()).toBe(hash);
    expect(
      new SurfaceSnapshot(new JsonDocument(JSON.stringify(inventory))).hash(),
    ).not.toBe(hash);
  });

  it('keeps changed exposure and stale hash detection separate without repairing either', () => {
    const hash = new SurfaceSnapshot(
      new JsonDocument(JSON.stringify(inventory)),
    ).hash();
    const changed = {
      ...inventory,
      surface_hash: hash,
      actions: [
        {
          id: 'result',
          data_exposure: {
            ...exposure,
            retention: {
              mode: 'bounded',
              max_seconds: 60,
              delete_on_grant_end: true,
            },
          },
        },
      ],
    };
    const document = new JsonDocument(JSON.stringify(changed));
    expect(
      new ManifestExposureDeclarations(document).validate(),
    ).toBeUndefined();
    expect(() => new SurfaceSnapshot(document).hash()).toThrow(
      'surface_hash_mismatch',
    );
    expect(document.parse()).toEqual(changed);
  });

  it('does not turn the Hello design fixture into a fully accepted SDK manifest', () => {
    const document = new JsonDocument(
      readFileSync(
        new URL(
          '../examples/design/hello-composition/asp-manifest.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    expect(
      new ManifestExposureDeclarations(document).validate(),
    ).toBeUndefined();
    expect(new SurfaceSnapshot(document).hash()).toBe(
      'sha-256:N-Wq3vC9_zchmpsXS4eLND16lNzRyIitlehKMMHXK0I',
    );
    // Its empty auth/audit are NOT validated or made deployable by this check.
    expect(document.parse()).toHaveProperty('auth', {});
  });

  it('does no constructor parsing and rejects malformed/root input only on explicit behavior', () => {
    for (const text of ['{', 'null', '[]', '0']) {
      let checker: ManifestExposureDeclarations | undefined;
      expect(() => {
        checker = new ManifestExposureDeclarations(new JsonDocument(text));
      }).not.toThrow();
      expect(() => checker?.validate()).toThrow();
    }
  });
});
