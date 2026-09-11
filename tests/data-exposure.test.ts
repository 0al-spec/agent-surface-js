import { describe, expect, it } from 'vitest';
import { DataClassCatalog } from '../src/data-class-catalog.js';
import { DataExposure } from '../src/data-exposure.js';
import { JsonDocument } from '../src/json-document.js';

type DataClass = {
  id: string;
  classification: 'public' | 'private' | 'sensitive' | 'credential';
  label: string;
  description: string;
};

const classes: readonly [DataClass, DataClass, DataClass, DataClass] = [
  {
    id: 'class.a',
    classification: 'public',
    label: 'Public value',
    description: 'Intentionally public application data.',
  },
  {
    id: 'class.b',
    classification: 'private',
    label: 'Private value',
    description: 'Non-public application data.',
  },
  {
    id: 'class.c',
    classification: 'sensitive',
    label: 'Sensitive value',
    description: 'Application data with material disclosure impact.',
  },
  {
    id: 'class.d',
    classification: 'credential',
    label: 'Credential value',
    description: 'Authentication material.',
  },
];

function json(value: unknown): JsonDocument {
  return new JsonDocument(JSON.stringify(value));
}

function catalog(value: unknown = classes): DataClassCatalog {
  return new DataClassCatalog(json(value));
}

function validExposure(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    classes: ['class.a'],
    redaction: { mode: 'none' },
    retention: { mode: 'user_managed' },
    ...overrides,
  };
}

function errorFrom(behavior: () => void): Error {
  try {
    behavior();
  } catch (error) {
    if (error instanceof Error) return error;
    throw error;
  }
  throw new Error('expected_error');
}

function expectCode(behavior: () => void, code: string): void {
  expect(errorFrom(behavior).message).toBe(code);
}

describe('DataClassCatalog', () => {
  it('accepts an empty catalog and every supported classification', () => {
    expect(new DataClassCatalog(json([])).validate()).toBeUndefined();
    expect(catalog().validate()).toBeUndefined();
  });

  it('orders identifiers by Unicode code point rather than UTF-16 code unit', () => {
    const ordered = [
      {
        id: 'class.\uE000',
        classification: 'private',
        label: 'BMP private-use value',
        description: 'A valid BMP identifier suffix.',
      },
      {
        id: 'class.\u{10000}',
        classification: 'sensitive',
        label: 'Supplementary-plane value',
        description: 'A valid supplementary-plane identifier suffix.',
      },
    ];
    expect(catalog(ordered).validate()).toBeUndefined();
    expectCode(
      () => catalog([...ordered].reverse()).validate(),
      'invalid_data_classes',
    );
  });

  it.each([
    null,
    {},
    'classes',
    1,
    true,
  ])('rejects a non-array catalog: %j', (value) => {
    expectCode(() => catalog(value).validate(), 'invalid_data_classes');
  });

  it.each([
    null,
    [],
    'class.a',
    1,
    true,
  ])('rejects a non-object catalog entry: %j', (value) => {
    expectCode(() => catalog([value]).validate(), 'invalid_data_classes');
  });

  it.each([
    'id',
    'classification',
    'label',
    'description',
  ] as const)('requires the %s member', (field) => {
    const { [field]: _omitted, ...entry } = classes[0];
    expectCode(() => catalog([entry]).validate(), 'invalid_data_classes');
  });

  it.each([
    { ...classes[0], id: '' },
    { ...classes[0], id: '   ' },
    { ...classes[0], id: 1 },
    { ...classes[0], label: '' },
    { ...classes[0], label: '\t' },
    { ...classes[0], label: false },
    { ...classes[0], description: '' },
    { ...classes[0], description: '\n' },
    { ...classes[0], description: [] },
    { ...classes[0], classification: 'unknown' },
    { ...classes[0], classification: 1 },
  ])('rejects an invalid known catalog member: %j', (entry) => {
    expectCode(() => catalog([entry]).validate(), 'invalid_data_classes');
  });

  it('rejects duplicate and non-canonically ordered identifiers without sorting', () => {
    expectCode(
      () =>
        catalog([classes[0], { ...classes[0], label: 'Duplicate' }]).validate(),
      'invalid_data_classes',
    );
    expectCode(
      () => catalog([classes[1], classes[0]]).validate(),
      'invalid_data_classes',
    );
  });

  it('distinguishes unsupported catalog members from invalid known members', () => {
    expectCode(
      () => catalog([{ ...classes[0], extra: true }]).validate(),
      'unsupported_data_classes',
    );
  });

  it.each([
    ['{', 'invalid_json'],
    [
      '[{"id":"class.a","id":"class.b","classification":"public","label":"A","description":"A"}]',
      'duplicate_json_member',
    ],
    [
      '[{"id":"class.a","classification":"public","label":"\\ud800","description":"A"}]',
      'invalid_unicode',
    ],
    [
      '[{"id":"class.a","classification":"public","label":"A","description":"A","number":-0}]',
      'invalid_json_number',
    ],
  ])('preserves the raw JSON boundary error for %s', (source, code) => {
    const value = new DataClassCatalog(new JsonDocument(source));
    expectCode(() => value.validate(), code);
  });

  it('keeps construction inert and validation repeatable', () => {
    expect(() => new DataClassCatalog(new JsonDocument('{'))).not.toThrow();
    const value = catalog();
    expect(value.validate()).toBeUndefined();
    expect(value.validate()).toBeUndefined();

    const invalid = catalog([classes[1], classes[0]]);
    expectCode(() => invalid.validate(), 'invalid_data_classes');
    expectCode(() => invalid.validate(), 'invalid_data_classes');
  });

  it('preserves caller-owned declaration text without trimming it', () => {
    const source = [
      {
        ...classes[0],
        label: '  Public value  ',
        description: '  Intentionally public application data.  ',
      },
    ];
    const document = json(source);
    const value = new DataClassCatalog(document);
    const before = document.parse();
    value.validate();
    expect(document.parse()).toEqual(before);
    expect(document.parse()).toEqual(source);
  });
});

describe('DataClassCatalog.validateClasses', () => {
  it.each([
    { value: [] },
    { value: ['class.a'] },
    { value: ['class.a', 'class.c'] },
    { value: classes.map(({ id }) => id) },
  ])('accepts a declared, ordered class subset: %j', ({ value }) => {
    expect(catalog().validateClasses(json(value))).toBeUndefined();
  });

  it.each([
    null,
    {},
    'class.a',
    [1],
    [''],
    ['   '],
    ['class.unknown'],
    ['class.a', 'class.a'],
    ['class.c', 'class.a'],
  ])('rejects invalid exposure classes: %j', (value) => {
    expectCode(
      () => catalog().validateClasses(json(value)),
      'invalid_data_exposure',
    );
  });

  it('applies the same Unicode code-point ordering to exposure classes', () => {
    const identifiers = ['class.\uE000', 'class.\u{10000}'];
    const unicodeCatalog = catalog(
      identifiers.map((id) => ({
        id,
        classification: 'private',
        label: id,
        description: id,
      })),
    );
    expect(unicodeCatalog.validateClasses(json(identifiers))).toBeUndefined();
    expectCode(
      () => unicodeCatalog.validateClasses(json([...identifiers].reverse())),
      'invalid_data_exposure',
    );
  });

  it('reports an invalid catalog before accepting a class list', () => {
    expectCode(
      () => catalog([classes[1], classes[0]]).validateClasses(json([])),
      'invalid_data_classes',
    );
  });
});

describe('DataExposure', () => {
  it.each([
    { mode: 'user_managed' },
    { mode: 'transient', delete_on_grant_end: true },
    { mode: 'transient', delete_on_grant_end: false },
    { mode: 'bounded', max_seconds: 1, delete_on_grant_end: true },
    {
      mode: 'bounded',
      max_seconds: Number.MAX_SAFE_INTEGER,
      delete_on_grant_end: false,
    },
  ])('accepts a closed retention variant: %j', (retention) => {
    const value = new DataExposure(
      json(validExposure({ retention })),
      catalog(),
    );
    expect(value.validate()).toBeUndefined();
  });

  it('accepts explicit empty exposure and policy redaction', () => {
    expect(
      new DataExposure(
        json(validExposure({ classes: [] })),
        catalog(),
      ).validate(),
    ).toBeUndefined();
    expect(
      new DataExposure(
        json(
          validExposure({
            classes: ['class.a', 'class.c'],
            redaction: {
              mode: 'policy',
              policy_id: 'visible-fields-v1',
              summary: 'Only visible fields are returned.',
            },
          }),
        ),
        catalog(),
      ).validate(),
    ).toBeUndefined();
  });

  it('ignores object member order while preserving array order', () => {
    const value = new DataExposure(
      new JsonDocument(
        '{"retention":{"delete_on_grant_end":false,"mode":"transient"},"redaction":{"summary":"  Visible fields only.  ","policy_id":"  policy-v1  ","mode":"policy"},"classes":["class.a","class.c"]}',
      ),
      catalog(),
    );
    expect(value.validate()).toBeUndefined();
  });

  it.each([
    null,
    [],
    'exposure',
    1,
    true,
    {},
  ])('rejects an invalid exposure root: %j', (source) => {
    expectCode(
      () => new DataExposure(json(source), catalog()).validate(),
      'invalid_data_exposure',
    );
  });

  it.each([
    'classes',
    'redaction',
    'retention',
  ])('requires the %s member', (field) => {
    const source = validExposure();
    delete source[field];
    expectCode(
      () => new DataExposure(json(source), catalog()).validate(),
      'invalid_data_exposure',
    );
  });

  it.each([
    { classes: null },
    { classes: {} },
    { classes: ['class.unknown'] },
    { classes: ['class.a', 'class.a'] },
    { classes: ['class.c', 'class.a'] },
    { redaction: null },
    { redaction: [] },
    { retention: null },
    { retention: [] },
  ])('rejects an invalid known exposure member: %j', (override) => {
    expectCode(
      () =>
        new DataExposure(json(validExposure(override)), catalog()).validate(),
      'invalid_data_exposure',
    );
  });

  it.each([
    { extra: true },
    { source: { kind: 'action', id: 'calculation.propose' } },
  ])('rejects an unsupported source-declaration member: %j', (extension) => {
    expectCode(
      () =>
        new DataExposure(
          json({ ...validExposure(), ...extension }),
          catalog(),
        ).validate(),
      'unsupported_data_exposure',
    );
  });

  it.each([
    {},
    null,
    [],
    { mode: null },
    { mode: false },
    { mode: 'unknown' },
    { mode: 'none', policy_id: 'policy-v1' },
    { mode: 'none', summary: 'Visible fields only.' },
    { mode: 'policy' },
    { mode: 'policy', policy_id: 'policy-v1' },
    { mode: 'policy', summary: 'Visible fields only.' },
    { mode: 'policy', policy_id: '', summary: 'Visible fields only.' },
    { mode: 'policy', policy_id: '   ', summary: 'Visible fields only.' },
    { mode: 'policy', policy_id: 'policy-v1', summary: '' },
    { mode: 'policy', policy_id: 'policy-v1', summary: '\t' },
    { mode: 'policy', policy_id: 1, summary: 'Visible fields only.' },
    { mode: 'policy', policy_id: 'policy-v1', summary: false },
  ])('rejects invalid redaction grammar: %j', (redaction) => {
    expectCode(
      () =>
        new DataExposure(
          json(validExposure({ redaction })),
          catalog(),
        ).validate(),
      'invalid_data_exposure',
    );
  });

  it.each([
    { mode: 'policy', policy_id: 'policy-v1', summary: 'Visible.', note: true },
    { mode: 'none', note: true },
  ])('reports unknown redaction members as unsupported: %j', (redaction) => {
    expectCode(
      () =>
        new DataExposure(
          json(validExposure({ redaction })),
          catalog(),
        ).validate(),
      'unsupported_data_exposure',
    );
  });

  it.each([
    {},
    null,
    [],
    { mode: null },
    { mode: [] },
    { mode: false },
    { mode: 'unknown' },
    { mode: 'transient' },
    { mode: 'transient', delete_on_grant_end: null },
    { mode: 'transient', delete_on_grant_end: 1 },
    { mode: 'transient', max_seconds: 60, delete_on_grant_end: true },
    { mode: 'bounded', delete_on_grant_end: false },
    { mode: 'bounded', max_seconds: 60 },
    { mode: 'bounded', max_seconds: 0, delete_on_grant_end: false },
    { mode: 'bounded', max_seconds: -1, delete_on_grant_end: false },
    { mode: 'bounded', max_seconds: 1.5, delete_on_grant_end: false },
    { mode: 'bounded', max_seconds: true, delete_on_grant_end: false },
    { mode: 'bounded', max_seconds: '60', delete_on_grant_end: false },
    {
      mode: 'bounded',
      max_seconds: Number.MAX_SAFE_INTEGER + 1,
      delete_on_grant_end: false,
    },
    { mode: 'user_managed', delete_on_grant_end: true },
    { mode: 'user_managed', delete_on_grant_end: false },
    { mode: 'user_managed', max_seconds: 60 },
    { mode: 'user_managed', extra: true },
  ])('rejects invalid retention grammar: %j', (retention) => {
    expectCode(
      () =>
        new DataExposure(
          json(validExposure({ retention })),
          catalog(),
        ).validate(),
      'invalid_data_exposure',
    );
  });

  it.each([
    { mode: 'transient', delete_on_grant_end: true, extra: true },
    {
      mode: 'bounded',
      max_seconds: 60,
      delete_on_grant_end: true,
      extra: true,
    },
  ])('reports unknown strict-retention members as unsupported: %j', (retention) => {
    expectCode(
      () =>
        new DataExposure(
          json(validExposure({ retention })),
          catalog(),
        ).validate(),
      'unsupported_data_exposure',
    );
  });

  it.each([
    ['{', 'invalid_json'],
    [
      '{"classes":[],"classes":["class.a"],"redaction":{"mode":"none"},"retention":{"mode":"user_managed"}}',
      'duplicate_json_member',
    ],
    [
      '{"classes":[],"redaction":{"mode":"none","mode":"policy"},"retention":{"mode":"user_managed"}}',
      'duplicate_json_member',
    ],
    [
      '{"classes":[],"redaction":{"mode":"policy","policy_id":"p","summary":"\\ud800"},"retention":{"mode":"user_managed"}}',
      'invalid_unicode',
    ],
    [
      '{"classes":[],"redaction":{"mode":"none"},"retention":{"mode":"bounded","max_seconds":-0,"delete_on_grant_end":true}}',
      'invalid_json_number',
    ],
    [
      '{"classes":[],"redaction":{"mode":"none"},"retention":{"mode":"bounded","max_seconds":1e400,"delete_on_grant_end":true}}',
      'invalid_json_number',
    ],
  ])('preserves the raw JSON boundary error for %s', (source, code) => {
    const value = new DataExposure(new JsonDocument(source), catalog());
    expectCode(() => value.validate(), code);
  });

  it('keeps construction inert and validation repeatable', () => {
    expect(
      () => new DataExposure(new JsonDocument('{'), catalog()),
    ).not.toThrow();

    const valid = new DataExposure(json(validExposure()), catalog());
    expect(valid.validate()).toBeUndefined();
    expect(valid.validate()).toBeUndefined();

    const invalid = new DataExposure(
      json(validExposure({ retention: { mode: 'unknown' } })),
      catalog(),
    );
    expectCode(() => invalid.validate(), 'invalid_data_exposure');
    expectCode(() => invalid.validate(), 'invalid_data_exposure');
  });

  it('does not mutate, normalize, sort, or default caller-owned input', () => {
    const source = validExposure({
      classes: ['class.a', 'class.c'],
      redaction: {
        mode: 'policy',
        policy_id: '  policy-v1  ',
        summary: '  Visible fields only.  ',
      },
      retention: { mode: 'transient', delete_on_grant_end: false },
    });
    const document = json(source);
    const value = new DataExposure(document, catalog());
    const before = document.parse();
    value.validate();
    expect(document.parse()).toEqual(before);
    expect(document.parse()).toEqual(source);

    const unsorted = json(validExposure({ classes: ['class.c', 'class.a'] }));
    const invalid = new DataExposure(unsorted, catalog());
    const invalidBefore = unsorted.parse();
    expectCode(() => invalid.validate(), 'invalid_data_exposure');
    expect(unsorted.parse()).toEqual(invalidBefore);
  });

  it('uses fixed safe errors that never echo caller values', () => {
    const sentinel = 'DO_NOT_ECHO_9f2bff13';
    const invalid = new DataExposure(
      json(validExposure({ classes: [sentinel] })),
      catalog(),
    );
    const invalidError = errorFrom(() => invalid.validate());
    expect(invalidError.message).toBe('invalid_data_exposure');
    expect(invalidError.message).not.toContain(sentinel);

    const unsupported = new DataExposure(
      json({ ...validExposure(), extra: sentinel }),
      catalog(),
    );
    const unsupportedError = errorFrom(() => unsupported.validate());
    expect(unsupportedError.message).toBe('unsupported_data_exposure');
    expect(unsupportedError.message).not.toContain(sentinel);
  });

  it('propagates an invalid catalog instead of accepting an empty class list', () => {
    const invalidCatalog = catalog([classes[1], classes[0]]);
    const value = new DataExposure(
      json(validExposure({ classes: [] })),
      invalidCatalog,
    );
    expectCode(() => value.validate(), 'invalid_data_classes');
  });
});
