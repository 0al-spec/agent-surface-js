import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  JsonDocument,
  type OfflineSchemaResource,
  OfflineSchemaResources,
  type PreparedSchema,
} from '../src/index.js';

const DIALECT = 'https://json-schema.org/draft/2020-12/schema';
const CALCU_URI = 'https://calcu.invalid/schemas/calculation-input.schema.json';
const HELLO_URI = 'https://hello.invalid/schemas/empty-object.schema.json';

function json(value: unknown): JsonDocument {
  return new JsonDocument(JSON.stringify(value));
}

function resource(
  uri: string,
  schema: Record<string, unknown>,
): OfflineSchemaResource {
  return { uri, document: json({ $schema: DIALECT, $id: uri, ...schema }) };
}

function prepared(
  uri: string,
  schema: Record<string, unknown>,
): PreparedSchema {
  return new OfflineSchemaResources([resource(uri, schema)])
    .prepare()
    .resolve(uri);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('offline application schema qualification', () => {
  it('validates unrelated Calcu and original-text Hello resources', () => {
    const helloText = readFileSync(
      new URL(
        '../examples/design/hello-composition/schemas/empty-object.schema.json',
        import.meta.url,
      ),
      'utf8',
    );
    const calcu = resource(CALCU_URI, {
      title: 'Calcu proposal input',
      type: 'object',
      properties: {
        operator: { enum: ['add', 'subtract', 'multiply', 'divide'] },
        left: { type: 'number', minimum: -1_000_000, maximum: 1_000_000 },
        right: {
          type: 'number',
          minimum: -1_000_000,
          maximum: 1_000_000,
        },
      },
      required: ['operator', 'left', 'right'],
      additionalProperties: false,
    });
    const schemas = new OfflineSchemaResources([
      calcu,
      { uri: HELLO_URI, document: new JsonDocument(helloText) },
    ]).prepare();

    const calculation = schemas.resolve(CALCU_URI);
    expect(() =>
      calculation.validate(json({ operator: 'multiply', left: 111, right: 2 })),
    ).not.toThrow();
    expect(() =>
      calculation.validate(json({ operator: 'sqrt', left: 111, right: 2 })),
    ).toThrow(/^schema_instance_invalid$/);
    expect(() =>
      calculation.validate(
        json({ operator: 'add', left: '1', right: 2, extra: true }),
      ),
    ).toThrow(/^schema_instance_invalid$/);

    const hello = schemas.resolve(HELLO_URI);
    expect(() => hello.validate(new JsonDocument('{}'))).not.toThrow();
    expect(() => hello.validate(new JsonDocument('{"name":"Ada"}'))).toThrow(
      /^schema_instance_invalid$/,
    );
  });

  it('uses the exact ASP input-schema hash domain and retains every literal', () => {
    const uri = 'https://schemas.example.test/amount';
    const text =
      '{"$id":"https://schemas.example.test/amount","$schema":"https://json-schema.org/draft/2020-12/schema","type":"string"}';
    const schemas = new OfflineSchemaResources([
      { uri, document: new JsonDocument(text) },
    ]).prepare();
    const expected = 'sha-256:4dd_8S-bsbC5sKemmFALn8oJhkUb-tYlIIe93EY3agU';

    expect(() =>
      schemas.resolveInput(uri, expected).validate(new JsonDocument('"12"')),
    ).not.toThrow();
    expect(() => schemas.resolveInput(uri, 'plain-sha-256')).toThrow(
      /^input_schema_hash_mismatch$/,
    );
    expect(() =>
      schemas.resolveInput(
        uri,
        'sha-256:Q2gjSTSPZ1b5gMFs3zIAtpqO0RHMt90sIy3TpjqFBkY',
      ),
    ).toThrow(/^input_schema_hash_mismatch$/);
    expect(() => schemas.resolveInput(uri, undefined as never)).toThrow(
      /^input_schema_hash_mismatch$/,
    );

    const extendedText = text.replace(
      ',"type":"string"}',
      ',"type":"string","default":{"$ref":"literal"}}',
    );
    const extended = new OfflineSchemaResources([
      { uri, document: new JsonDocument(extendedText) },
    ]).prepare();
    expect(() => extended.resolveInput(uri, expected)).toThrow(
      /^input_schema_hash_mismatch$/,
    );
  });

  it('keeps construction inert, captures entries, and caches only success', () => {
    const original = resource('https://schemas.example.test/original', {
      type: 'string',
    });
    const entries = [original];
    const resources = new OfflineSchemaResources(entries);
    entries[0] = resource('https://schemas.example.test/substitute', {
      type: 'number',
    });

    const first = resources.prepare();
    expect(resources.prepare()).toBe(first);
    expect(() => first.resolve(original.uri)).not.toThrow();
    expect(() => first.resolve(entries[0]?.uri ?? '')).toThrow(
      /^schema_resource_missing$/,
    );

    expect(
      () =>
        new OfflineSchemaResources([
          { uri: 'not a uri', document: new JsonDocument('{') },
        ]),
    ).not.toThrow();
    const invalid = new OfflineSchemaResources([
      { uri: 'not a uri', document: new JsonDocument('{') },
    ]);
    expect(() => invalid.prepare()).toThrow(/^invalid_schema_resource_uri$/);
    expect(() => invalid.prepare()).toThrow(/^invalid_schema_resource_uri$/);
  });

  it('never shares a URI-only validator cache across registries', () => {
    const uri = 'https://schemas.example.test/substitution';
    const strings = new OfflineSchemaResources([
      resource(uri, { type: 'string' }),
    ]).prepare();
    const numbers = new OfflineSchemaResources([
      resource(uri, { type: 'number' }),
    ]).prepare();

    expect(() =>
      strings.resolve(uri).validate(new JsonDocument('"x"')),
    ).not.toThrow();
    expect(() => strings.resolve(uri).validate(new JsonDocument('1'))).toThrow(
      /^schema_instance_invalid$/,
    );
    expect(() =>
      numbers.resolve(uri).validate(new JsonDocument('1')),
    ).not.toThrow();
    expect(() =>
      numbers.resolve(uri).validate(new JsonDocument('"x"')),
    ).toThrow(/^schema_instance_invalid$/);
  });
});

describe('exact offline resource boundaries', () => {
  it.each([
    'http://schemas.example.test/value',
    'https:schemas.example.test/value',
    'https:///schemas.example.test/value',
    'https://@schemas.example.test/value',
    'https://user@schemas.example.test/value',
    'https://:secret@schemas.example.test/value',
    'https://schemas.example.test/value#',
    'https://schemas.example.test/va\\lue',
    'https://schemas.example.test/%zz',
    'https://schemas.example.test/{value}',
    'https://schemas.example.test/value|other',
    'https://schemas.example.test/value with space',
    ' https://schemas.example.test/value',
    'https://schemas.example.test/value\n',
  ])('rejects a non-selected resource URI without rewriting: %s', (uri) => {
    const resources = new OfflineSchemaResources([
      resource(uri, { type: 'string' }),
    ]);
    expect(() => resources.prepare()).toThrow(/^invalid_schema_resource_uri$/);
  });

  it('uses exact URI equality for IDs, lookup, and duplicate detection', () => {
    const uri = 'https://SCHEMAS.example.test/Case';
    const schemas = new OfflineSchemaResources([
      resource(uri, { type: 'string' }),
    ]).prepare();
    expect(() => schemas.resolve(uri)).not.toThrow();
    expect(() => schemas.resolve(uri.toLowerCase())).toThrow(
      /^schema_resource_missing$/,
    );
    expect(() =>
      new OfflineSchemaResources([
        resource(uri, { type: 'string' }),
        resource(uri, { type: 'number' }),
      ]).prepare(),
    ).toThrow(/^duplicate_schema_resource$/);
  });

  it('accepts valid percent-encoded URI data without rewriting the key', () => {
    const uri = 'https://schemas.example.test/value%20space?kind=a%2Fb';
    const schemas = new OfflineSchemaResources([
      resource(uri, { type: 'string' }),
    ]).prepare();
    expect(() => schemas.resolve(uri)).not.toThrow();
    expect(() =>
      schemas.resolve('https://schemas.example.test/value space?kind=a/b'),
    ).toThrow(/^schema_resource_missing$/);
  });

  it.each([
    [{ type: 'string' }, 'schema_dialect_unsupported'],
    [
      {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'string',
      },
      'schema_dialect_unsupported',
    ],
  ])('rejects a missing or wrong dialect', (body, error) => {
    const uri = 'https://schemas.example.test/dialect';
    const document = json({ $id: uri, ...body });
    expect(() =>
      new OfflineSchemaResources([{ uri, document }]).prepare(),
    ).toThrow(new RegExp(`^${error}$`));
  });

  it('rejects a mismatching root ID and every nested ID', () => {
    const uri = 'https://schemas.example.test/id';
    expect(() =>
      new OfflineSchemaResources([
        resource(uri, {
          $id: 'https://schemas.example.test/other',
          type: 'string',
        }),
      ]).prepare(),
    ).toThrow(/^schema_id_mismatch$/);
    expect(() =>
      new OfflineSchemaResources([
        resource(uri, {
          type: 'object',
          properties: {
            value: { $id: uri, type: 'string' },
          },
        }),
      ]).prepare(),
    ).toThrow(/^schema_nested_id_unsupported$/);
  });

  it.each([
    [
      '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"string","type":"number"}',
      'duplicate_json_member',
    ],
    [
      '{"$schema":"https://json-schema.org/draft/2020-12/schema","minimum":1e400}',
      'invalid_json_number',
    ],
    [
      '{"$schema":"https://json-schema.org/draft/2020-12/schema","default":-0}',
      'invalid_json_number',
    ],
    [
      '{"$schema":"https://json-schema.org/draft/2020-12/schema","title":"\\ud800"}',
      'invalid_unicode',
    ],
  ])('rejects invalid original schema JSON before extraction: %s', (text, error) => {
    const resources = new OfflineSchemaResources([
      {
        uri: 'https://schemas.example.test/raw',
        document: new JsonDocument(text),
      },
    ]);
    expect(() => resources.prepare()).toThrow(new RegExp(`^${error}$`));
  });

  it('does not retrieve an external network or file reference', () => {
    const fetch = vi.fn(() => {
      throw new Error('must_not_fetch');
    });
    vi.stubGlobal('fetch', fetch);

    for (const reference of [
      'https://other.example.test/schema',
      'file:///tmp/schema.json',
    ]) {
      expect(() =>
        new OfflineSchemaResources([
          resource('https://schemas.example.test/no-fetch', {
            $ref: reference,
          }),
        ]).prepare(),
      ).toThrow(/^schema_reference_unsupported$/);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('same-document JSON Pointer qualification', () => {
  it('decodes URI percent escapes once and JSON Pointer escapes once', () => {
    const uri = 'https://schemas.example.test/pointer';
    const schema = prepared(uri, {
      $ref: '#/$defs/a~1b~0c%20d',
      $defs: {
        'a/b~c d': { type: 'integer' },
      },
    });
    expect(() => schema.validate(new JsonDocument('3'))).not.toThrow();
    expect(() => schema.validate(new JsonDocument('"3"'))).toThrow(
      /^schema_instance_invalid$/,
    );
  });

  it.each([
    '#/$defs/a~2b',
    '#/$defs/a~',
    '#/%ZZ',
    '#named',
    '#/$defs/x y',
    '#/$defs/{x}',
    '#/$defs/x|y',
  ])('rejects a malformed or anchor-like fragment: %s', (reference) => {
    const uri = 'https://schemas.example.test/bad-pointer';
    expect(() =>
      new OfflineSchemaResources([
        resource(uri, { $ref: reference, $defs: { a: true } }),
      ]).prepare(),
    ).toThrow(/^schema_reference_unsupported$/);
  });

  it('treats reference-looking literal data as data, never schema locations', () => {
    const uri = 'https://schemas.example.test/literal';
    const literal = { $ref: 'https://must-not-resolve.invalid/schema' };
    const schemas = new OfflineSchemaResources([
      resource(uri, {
        const: literal,
        default: { nested: literal },
        examples: [{ nested: literal }],
      }),
    ]).prepare();
    expect(() => schemas.resolve(uri).validate(json(literal))).not.toThrow();
    expect(() =>
      schemas.resolve(uri).validate(json({ $ref: 'other' })),
    ).toThrow(/^schema_instance_invalid$/);

    const enumerated = prepared('https://schemas.example.test/literal-enum', {
      enum: [literal],
    });
    expect(() => enumerated.validate(json(literal))).not.toThrow();

    for (const [reference, assertion] of [
      ['#/const/not-a-schema', { const: { 'not-a-schema': true } }],
      ['#/enum/0/not-a-schema', { enum: [{ 'not-a-schema': true }] }],
      ['#/examples/0/not-a-schema', { examples: [{ 'not-a-schema': true }] }],
      ['#/default/not-a-schema', { default: { 'not-a-schema': true } }],
    ] as const) {
      expect(() =>
        new OfflineSchemaResources([
          resource('https://schemas.example.test/literal-target', {
            $ref: reference,
            ...assertion,
          }),
        ]).prepare(),
      ).toThrow(/^schema_reference_target_unsupported$/);
    }
  });

  it('accepts a shared-reference DAG but rejects a reference cycle', () => {
    const uri = 'https://schemas.example.test/dag';
    const dag = prepared(uri, {
      type: 'object',
      properties: {
        left: { $ref: '#/$defs/leaf' },
        right: { $ref: '#/$defs/leaf' },
      },
      required: ['left', 'right'],
      additionalProperties: false,
      $defs: { leaf: { type: 'string' } },
    });
    expect(() => dag.validate(json({ left: 'a', right: 'b' }))).not.toThrow();

    expect(() =>
      new OfflineSchemaResources([
        resource('https://schemas.example.test/cycle', {
          $ref: '#/$defs/a',
          $defs: {
            a: { $ref: '#/$defs/b' },
            b: { $ref: '#/$defs/a' },
          },
        }),
      ]).prepare(),
    ).toThrow(/^schema_reference_cycle$/);
  });

  it.each([
    ['$dynamicRef', '#node'],
    ['$anchor', 'node'],
    ['$dynamicAnchor', 'node'],
  ])('rejects dynamic and anchor keyword %s', (keyword, value) => {
    const uri = 'https://schemas.example.test/dynamic';
    expect(() =>
      new OfflineSchemaResources([
        resource(uri, { [keyword]: value }),
      ]).prepare(),
    ).toThrow(/^schema_reference_unsupported$/);
  });
});

describe('qualified engine behavior', () => {
  it('supports bounded object, array, boolean, numeric, and string assertions', () => {
    const uri = 'https://schemas.example.test/supported';
    const schema = prepared(uri, {
      type: 'object',
      properties: {
        label: { type: 'string', minLength: 2, maxLength: 4 },
        values: {
          type: 'array',
          minItems: 2,
          maxItems: 3,
          prefixItems: [{ type: 'integer', minimum: 0, maximum: 10 }],
          items: { type: 'number' },
        },
        denied: false,
      },
      required: ['label', 'values'],
      additionalProperties: false,
    });
    expect(() =>
      schema.validate(json({ label: 'ok', values: [2, 2.5] })),
    ).not.toThrow();
    expect(() =>
      schema.validate(json({ label: 'x', values: [-1, '2'] })),
    ).toThrow(/^schema_instance_invalid$/);
    expect(() =>
      schema.validate(json({ label: 'okay', values: [2, 3], denied: null })),
    ).toThrow(/^schema_instance_invalid$/);
  });

  it('does not coerce, insert defaults, remove properties, or mutate documents', () => {
    const uri = 'https://schemas.example.test/non-mutating';
    const schema = prepared(uri, {
      type: 'object',
      properties: { count: { type: 'integer', default: 5 } },
      required: ['count'],
      additionalProperties: false,
    });
    const valid = json({ count: 5 });
    const before = valid.parse();
    expect(() => schema.validate(valid)).not.toThrow();
    expect(valid.parse()).toEqual(before);

    const invalid = json({ count: '5', extra: true });
    const invalidBefore = invalid.parse();
    expect(() => schema.validate(invalid)).toThrow(/^schema_instance_invalid$/);
    expect(invalid.parse()).toEqual(invalidBefore);
    expect(() => schema.validate(json({}))).toThrow(
      /^schema_instance_invalid$/,
    );
  });

  it.each([
    ['allOf', []],
    ['anyOf', []],
    ['oneOf', []],
    ['not', true],
    ['if', true],
    ['then', true],
    ['else', true],
    ['pattern', '^a+$'],
    ['format', 'email'],
    ['uniqueItems', true],
    ['contains', true],
    ['dependentSchemas', {}],
    ['dependentRequired', {}],
    ['unevaluatedProperties', false],
    ['propertyNames', { type: 'string' }],
    ['multipleOf', 1],
  ])('rejects unqualified keyword %s instead of ignoring it', (keyword, value) => {
    const uri = 'https://schemas.example.test/unsupported';
    expect(() =>
      new OfflineSchemaResources([
        resource(uri, { [keyword]: value }),
      ]).prepare(),
    ).toThrow(/^schema_keyword_unsupported$/);
  });

  it('uses the Draft 2020-12 metaschema rather than accepting malformed assertions', () => {
    const uri = 'https://schemas.example.test/meta';
    for (const schema of [
      { type: 'unknown' },
      { type: 'object', required: ['x', 'x'] },
      { type: 'number', minimum: 'zero' },
      { type: 'array', prefixItems: [42] },
    ]) {
      expect(() =>
        new OfflineSchemaResources([resource(uri, schema)]).prepare(),
      ).toThrow(/^schema_invalid$/);
    }
  });

  it('maps ambient engine-construction failures to a fixed diagnostic', () => {
    const uri = 'https://schemas.example.test/ambient';
    const resources = new OfflineSchemaResources([
      resource(uri, { type: 'string' }),
    ]);
    const previous = Object.getOwnPropertyDescriptor(
      Object.prototype,
      '$schema',
    );
    let failure: unknown;
    try {
      Object.defineProperty(Object.prototype, '$schema', {
        configurable: true,
        enumerable: true,
        value: 'ambient',
        writable: true,
      });
      try {
        resources.prepare();
      } catch (error) {
        failure = error;
      }
    } finally {
      if (previous === undefined)
        delete (Object.prototype as { $schema?: unknown }).$schema;
      else Object.defineProperty(Object.prototype, '$schema', previous);
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe('schema_invalid');
  });

  it('rejects Ajv-unsafe reserved schema member names explicitly', () => {
    const uri = 'https://schemas.example.test/reserved';
    for (const schema of [
      JSON.parse(
        '{"type":"object","properties":{"__proto__":{"type":"string"}}}',
      ) as Record<string, unknown>,
      { type: 'object', properties: { constructor: { type: 'string' } } },
      { const: JSON.parse('{"toString":1}') as unknown },
      { $defs: { prototype: { type: 'string' } } },
    ]) {
      expect(() =>
        new OfflineSchemaResources([resource(uri, schema)]).prepare(),
      ).toThrow(/^schema_reserved_name_unsupported$/);
    }
  });

  it('keeps fixed diagnostics free of schema and instance content', () => {
    const uri = 'https://schemas.example.test/secret-schema-name';
    const schema = prepared(uri, { type: 'string', const: 'secret-value' });
    try {
      schema.validate(new JsonDocument('"private-instance-value"'));
      throw new Error('expected_failure');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('schema_instance_invalid');
      expect((error as Error).message).not.toContain('secret');
      expect((error as Error).message).not.toContain('private');
    }
  });
});
