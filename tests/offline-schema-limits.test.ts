import { describe, expect, it, vi } from 'vitest';
import {
  JsonDocument,
  type OfflineSchemaResource,
  OfflineSchemaResources,
} from '../src/index.js';

const DIALECT = 'https://json-schema.org/draft/2020-12/schema';

function resource(
  suffix: string,
  schema: Record<string, unknown>,
): OfflineSchemaResource {
  const uri = `https://schemas.example.test/${suffix}`;
  return {
    uri,
    document: new JsonDocument(
      JSON.stringify({ $schema: DIALECT, $id: uri, ...schema }),
    ),
  };
}

function sizedResource(suffix: string, bytes: number): OfflineSchemaResource {
  const uri = `https://schemas.example.test/${suffix}`;
  const empty = JSON.stringify({
    $schema: DIALECT,
    $id: uri,
    description: '',
    type: 'string',
  });
  const remaining = bytes - Buffer.byteLength(empty, 'utf8');
  if (remaining < 4) throw new Error('test_fixture_too_small');
  const content = `😀${'x'.repeat(remaining - 4)}`;
  const text = empty.replace('"description":""', `"description":"${content}"`);
  if (Buffer.byteLength(text, 'utf8') !== bytes) {
    throw new Error('test_fixture_wrong_size');
  }
  return { uri, document: new JsonDocument(text) };
}

function manyNodeSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: Object.fromEntries(
      Array.from({ length: 43 }, (_, outer) => [
        `outer-${outer}`,
        {
          type: 'object',
          properties: Object.fromEntries(
            Array.from({ length: 3 }, (_, inner) => [
              `inner-${inner}`,
              { type: 'string' },
            ]),
          ),
        },
      ]),
    ),
  };
}

function manyReferenceSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: Object.fromEntries(
      Array.from({ length: 50 }, (_, index) => [
        `value-${index}`,
        { $ref: '#/$defs/leaf' },
      ]),
    ),
    $defs: { leaf: { type: 'string' } },
  };
}

describe('schema preparation limits', () => {
  it('rejects a seventeenth resource without traversing an unbounded input array', () => {
    const resources = Array.from({ length: 17 }, (_, index) =>
      resource(`count-${index}`, { type: 'string' }),
    );
    expect(() => new OfflineSchemaResources(resources).prepare()).toThrow(
      /^schema_resource_count_limit$/,
    );
    expect(() =>
      new OfflineSchemaResources(resources.slice(0, 16)).prepare(),
    ).not.toThrow();
  });

  it('checks each original UTF-8 byte limit before parsing', () => {
    const accepted = sizedResource('exact-byte-limit', 64 * 1024);
    expect(accepted.document.utf8ByteLength()).toBe(64 * 1024);
    expect(() =>
      new OfflineSchemaResources([accepted]).prepare(),
    ).not.toThrow();

    const resources = new OfflineSchemaResources([
      sizedResource('over-byte-limit', 64 * 1024 + 1),
    ]);
    expect(() => resources.prepare()).toThrow(/^schema_resource_byte_limit$/);

    const malformed = new OfflineSchemaResources([
      {
        uri: 'https://schemas.example.test/oversized-before-parse',
        document: new JsonDocument(' '.repeat(64 * 1024 + 1)),
      },
    ]);
    expect(() => malformed.prepare()).toThrow(/^schema_resource_byte_limit$/);
  });

  it('never retains a partial prepared cache after a later resource fails', () => {
    const valid = resource('staged-valid', { type: 'string' });
    const parse = vi.spyOn(valid.document, 'parse');
    const resources = new OfflineSchemaResources([
      valid,
      {
        uri: 'https://schemas.example.test/staged-invalid',
        document: new JsonDocument(
          JSON.stringify({
            $schema: 'https://json-schema.org/draft/2019-09/schema',
            type: 'string',
          }),
        ),
      },
    ]);
    expect(() => resources.prepare()).toThrow(/^schema_dialect_unsupported$/);
    const callsAfterFirstFailure = parse.mock.calls.length;
    expect(callsAfterFirstFailure).toBeGreaterThan(0);
    expect(() => resources.prepare()).toThrow(/^schema_dialect_unsupported$/);
    expect(parse.mock.calls.length).toBeGreaterThan(callsAfterFirstFailure);
  });

  it('checks aggregate original bytes independently of the per-resource cap', () => {
    const resources = Array.from({ length: 5 }, (_, index) =>
      resource(`aggregate-${index}`, {
        title: `schema-${index}`,
        description: 'x'.repeat(54 * 1024),
        type: 'string',
      }),
    );
    expect(() => new OfflineSchemaResources(resources).prepare()).toThrow(
      /^schema_aggregate_byte_limit$/,
    );
  });

  it('bounds schema-bearing nodes and containment depth', () => {
    const properties = Object.fromEntries(
      Array.from({ length: 64 }, (_, outer) => [
        `outer-${outer}`,
        {
          type: 'object',
          properties: Object.fromEntries(
            Array.from({ length: 4 }, (_, inner) => [
              `inner-${inner}`,
              { type: 'string' },
            ]),
          ),
          additionalProperties: false,
        },
      ]),
    );
    expect(() =>
      new OfflineSchemaResources([
        resource('too-many-nodes', {
          type: 'object',
          properties,
          additionalProperties: false,
        }),
      ]).prepare(),
    ).toThrow(/^schema_node_limit$/);

    let nested: Record<string, unknown> = { type: 'number' };
    for (let depth = 0; depth < 33; depth += 1) {
      nested = { type: 'array', items: nested };
    }
    expect(() =>
      new OfflineSchemaResources([resource('too-deep', nested)]).prepare(),
    ).toThrow(/^schema_depth_limit$/);
  });

  it('bounds direct reference count', () => {
    const properties = Object.fromEntries(
      Array.from({ length: 64 }, (_, index) => [
        `value-${index}`,
        { $ref: '#/$defs/leaf' },
      ]),
    );
    expect(() =>
      new OfflineSchemaResources([
        resource('too-many-refs', {
          $ref: '#/$defs/leaf',
          type: 'object',
          properties,
          $defs: { leaf: { type: 'string' } },
        }),
      ]).prepare(),
    ).toThrow(/^schema_reference_limit$/);
  });

  it('bounds aggregate schema nodes and references independently', () => {
    expect(() =>
      new OfflineSchemaResources([
        resource('aggregate-nodes-1', manyNodeSchema()),
        resource('aggregate-nodes-2', manyNodeSchema()),
        resource('aggregate-nodes-3', manyNodeSchema()),
      ]).prepare(),
    ).toThrow(/^schema_aggregate_node_limit$/);

    expect(() =>
      new OfflineSchemaResources([
        resource('aggregate-refs-1', manyReferenceSchema()),
        resource('aggregate-refs-2', manyReferenceSchema()),
        resource('aggregate-refs-3', manyReferenceSchema()),
      ]).prepare(),
    ).toThrow(/^schema_aggregate_reference_limit$/);
  });

  it('rejects a small reference DAG whose expanded work is exponential', () => {
    const definitions: Record<string, unknown> = {
      leaf: { type: 'string' },
    };
    for (let level = 11; level >= 0; level -= 1) {
      const target = level === 11 ? 'leaf' : `level-${level + 1}`;
      definitions[`level-${level}`] = {
        type: 'object',
        properties: {
          left: { $ref: `#/$defs/${target}` },
          right: { $ref: `#/$defs/${target}` },
        },
      };
    }
    expect(() =>
      new OfflineSchemaResources([
        resource('expanding-dag', {
          $ref: '#/$defs/level-0',
          $defs: definitions,
        }),
      ]).prepare(),
    ).toThrow(/^schema_reference_expansion_limit$/);
  });
});

describe('instance validation limits', () => {
  it('checks instance bytes before parsing malformed oversized JSON', () => {
    const schema = new OfflineSchemaResources([
      resource('instance-byte-limit', { type: 'string' }),
    ])
      .prepare()
      .resolve('https://schemas.example.test/instance-byte-limit');
    expect(() =>
      schema.validate(new JsonDocument(`"${'x'.repeat(64 * 1024)}`)),
    ).toThrow(/^schema_instance_byte_limit$/);
  });

  it('bounds parsed instance nodes and depth before engine execution', () => {
    const array = new OfflineSchemaResources([
      resource('instance-node-limit', {
        type: 'array',
        items: { type: 'integer' },
      }),
    ])
      .prepare()
      .resolve('https://schemas.example.test/instance-node-limit');
    expect(() =>
      array.validate(
        new JsonDocument(
          JSON.stringify(Array.from({ length: 4_096 }, () => 0)),
        ),
      ),
    ).toThrow(/^schema_instance_node_limit$/);

    const any = new OfflineSchemaResources([
      resource('instance-depth-limit', {}),
    ])
      .prepare()
      .resolve('https://schemas.example.test/instance-depth-limit');
    const nested = `${'['.repeat(65)}0${']'.repeat(65)}`;
    expect(() => any.validate(new JsonDocument(nested))).toThrow(
      /^schema_instance_depth_limit$/,
    );
  });

  it('uses schema expansion and instance size for a conservative work cap', () => {
    const uri = 'https://schemas.example.test/instance-work-limit';
    const schema = new OfflineSchemaResources([
      resource('instance-work-limit', {
        type: 'object',
        properties: {
          payload: { type: 'string', minLength: 1 },
        },
        required: ['payload'],
        additionalProperties: false,
      }),
    ])
      .prepare()
      .resolve(uri);
    const otherwiseValid = new JsonDocument(
      JSON.stringify({ payload: 'x'.repeat(50_000) }),
    );
    expect(() => schema.validate(otherwiseValid)).toThrow(
      /^schema_instance_work_limit$/,
    );
  });

  it.each([
    ['{"value":1,"value":2}', 'duplicate_json_member'],
    ['1e400', 'invalid_json_number'],
    ['"\\ud800"', 'invalid_unicode'],
  ])('rejects raw instance defect %s before engine validation', (text, error) => {
    const schema = new OfflineSchemaResources([resource('raw-instance', {})])
      .prepare()
      .resolve('https://schemas.example.test/raw-instance');
    expect(() => schema.validate(new JsonDocument(text))).toThrow(
      new RegExp(`^${error}$`),
    );
  });
});
