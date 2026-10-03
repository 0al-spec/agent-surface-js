import { type TSchema, Type } from '@sinclair/typebox';
import { describe, expect, it, vi } from 'vitest';
import {
  type ActionDeclaration,
  OfflineActionInventory,
} from '../src/authoring/index.js';
import { JsonDocument } from '../src/index.js';
import {
  base,
  calculation,
  classes,
  composed,
  greeting,
  json,
} from './fixtures/authoring.js';

const KIND = Symbol.for('TypeBox.Kind');
const input = { operator: 'multiply', left: 240, right: 0.15 };
const output = { ...input, result: 36 };
const inventory = (
  declarations: readonly ActionDeclaration[] = [calculation()],
) => new OfflineActionInventory(classes, declarations);
const withInput = (schema: TSchema) =>
  inventory([{ ...calculation(), input: schema }]);
const object = (value: TSchema) =>
  Type.Object({ value }, { additionalProperties: false });

function defined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('missing_test_fixture');
  return value;
}

describe('offline authoring boundary', () => {
  it('preserves an explicit input hash profile through authoring and full composition', () => {
    const original = calculation();
    const declaration = {
      ...original,
      action: {
        ...original.action,
        input_hash_profile: 'asp-jcs-sha-256' as const,
      },
    };
    const prepared = inventory([declaration]).prepare(base);
    expect(defined(prepared.actionDocuments[0]).parse()).toMatchObject({
      input_hash_profile: 'asp-jcs-sha-256',
    });
    const withProfile = composed(prepared).prepare();
    expect(withProfile.hash()).not.toBe(
      composed(inventory().prepare(base)).prepare().hash(),
    );
    expect(declaration.action.input_hash_profile).toBe('asp-jcs-sha-256');
  });

  it.each([
    null,
    '',
    'sha-256',
    'asp-jcs-sha-512',
    true,
    {},
  ])('rejects unsupported input hash profile %j before publication', (profile) => {
    const declaration = calculation();
    Reflect.set(declaration.action, 'input_hash_profile', profile);
    expect(() => inventory([declaration]).prepare(base)).toThrow(
      'unsupported_action_metadata',
    );
  });

  it('prepares both domains, with shape checks but no invocation or authority', () => {
    const prepared = inventory([calculation(), greeting()]).prepare(base);
    expect(prepared.actionDocuments).toHaveLength(2);
    expect(prepared.schemaResources).toHaveLength(4);
    prepared.validateInput('calculation.propose', json(input));
    prepared.validateOutput('calculation.propose', json(output));
    prepared.validateInput('greeting.propose', json({}));
    prepared.validateOutput(
      'greeting.propose',
      json({ greeting: 'Hello, world!' }),
    );
    expect(Object.keys(prepared)).toEqual([
      'actionDocuments',
      'schemaResources',
    ]);
    for (const member of ['run', 'invoke', 'handler', 'grant', 'session'])
      expect(member in prepared).toBe(false);
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.actionDocuments)).toBe(true);
    expect(Object.isFrozen(prepared.schemaResources[0])).toBe(true);
    expect(() => prepared.validateInput('sqrt', json(input))).toThrow(
      'action_not_declared',
    );
  });

  it('composes a complete single-action manifest but does not expand that contract', () => {
    const full = composed(inventory().prepare(base)).prepare();
    full.validateInput('calculation.propose', json(input));
    full.validateOutput('calculation.propose', json(output));
    expect(() =>
      composed(inventory([calculation(), greeting()]).prepare(base)).prepare(),
    ).toThrow();
  });

  it.each([
    'add',
    'subtract',
    'multiply',
    'divide',
  ])('allows only the declared operation %s', (operator) => {
    inventory()
      .prepare(base)
      .validateInput('calculation.propose', json({ ...input, operator }));
  });

  it.each([
    '{"operator":"sqrt","left":111,"right":2}',
    '{"operator":"multiply","left":1,"left":240,"right":0.15}',
    '{"operator":"multiply","left":-0,"right":2}',
    '{"operator":"multiply","left":1e999,"right":2}',
    '{"operator":"multiply","left":"240","right":0.15}',
    '{"operator":"multiply","left":240,"right":0.15,"extra":true}',
    '{"operator":"multiply","left":240}',
    '{invalid',
  ])('preserves raw JSON rejection: %s', (source) => {
    expect(() =>
      inventory()
        .prepare(base)
        .validateInput('calculation.propose', new JsonDocument(source)),
    ).toThrow();
  });

  it('rejects a handler without invoking it or parsing in the constructor', () => {
    const handler = vi.fn();
    const parse = vi.spyOn(classes, 'parse');
    const captured = inventory([
      { ...calculation(), handler } as ActionDeclaration,
    ]);
    expect(handler).not.toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();
    expect(() => captured.prepare(base)).toThrow('authoring_capture_invalid');
    parse.mockRestore();
  });

  it('captures membership and deep values without freezing caller objects', () => {
    const original = calculation();
    const declarations = [original];
    const captured = inventory(declarations);
    original.action.id = 'changed';
    original.action.data_exposure.classes.push('unknown');
    Reflect.set(original.input.properties.left, 'type', 'string');
    defined(original.input.properties.operator.anyOf[0]).const = 'sqrt';
    declarations.length = 0;
    const prepared = captured.prepare(base);
    prepared.validateInput(
      'calculation.propose',
      json({ ...input, operator: 'add' }),
    );
    expect(() => prepared.validateInput('changed', json(input))).toThrow(
      'action_not_declared',
    );
    expect(Object.isFrozen(original)).toBe(false);
    expect(Object.isFrozen(original.input)).toBe(false);
    (
      defined(prepared.actionDocuments[0]).parse() as Record<string, unknown>
    ).id = 'tampered';
    prepared.validateInput('calculation.propose', json(input));
    expect(captured.prepare(base.slice(0, -1))).toBe(prepared);
    expect(() => captured.prepare('https://another.example/schemas/')).toThrow(
      'schema_base_uri_changed',
    );
  });

  it('never invokes accessors, and repairing the caller does not repair a failed capture', () => {
    const declaration = calculation();
    const getter = vi.fn(() => 'propose');
    Object.defineProperty(declaration.action, 'risk', {
      get: getter,
      configurable: true,
      enumerable: true,
    });
    const captured = inventory([declaration]);
    Object.defineProperty(declaration.action, 'risk', {
      value: 'propose',
      enumerable: true,
    });
    expect(getter).not.toHaveBeenCalled();
    expect(() => captured.prepare(base)).toThrow('authoring_capture_invalid');
    expect(getter).not.toHaveBeenCalled();
  });

  it('accepts a shared acyclic schema graph but rejects cycles and expanded sharing', () => {
    const number = Type.Number();
    const shared = Type.Object(
      { a: number, b: number },
      { additionalProperties: false },
    );
    withInput(shared)
      .prepare(base)
      .validateInput('calculation.propose', json({ a: 1, b: 2 }));
    Reflect.set(shared.properties, 'cycle', shared);
    expect(() => withInput(shared).prepare(base)).toThrow(
      'authoring_capture_invalid',
    );
    let large: TSchema = Type.Number();
    for (let level = 0; level < 12; level++)
      large = Type.Object(
        { a: large, b: large },
        { additionalProperties: false },
      );
    expect(() => withInput(large).prepare(base)).toThrow(
      'authoring_capture_invalid',
    );
  });

  it('does not cache a valid prefix when a later declaration fails', () => {
    const invalid = greeting();
    Reflect.set(invalid.action, 'side_effect', true);
    const captured = inventory([calculation(), invalid]);
    expect(() => captured.prepare(base)).toThrow('unsupported_action_metadata');
    Reflect.set(invalid.action, 'side_effect', false);
    expect(() => captured.prepare(base)).toThrow('unsupported_action_metadata');
  });

  it.each([
    'http://example.test/',
    'https://user:secret@example.test/',
    'https://example.test/?',
    'https://example.test/#',
    ' https://example.test/',
    'https://example.test/\\escape',
    'https://example.test/%zz',
    'https://example.test/[unexpected]',
    'https://example.test/^/',
    'https://example.test/|/',
  ])('rejects invalid namespaces: %s', (uri) => {
    expect(() => inventory().prepare(uri)).toThrow('invalid_schema_base_uri');
    expect(() => inventory([]).prepare(uri)).toThrow('invalid_schema_base_uri');
  });

  it('rejects missing/extra metadata, undeclared data classes and duplicate IDs', () => {
    const extra = calculation();
    Reflect.set(extra.action, 'grant', 'not-authority');
    expect(() => inventory([extra]).prepare(base)).toThrow(
      'unsupported_action_metadata',
    );
    const missing = calculation();
    Reflect.deleteProperty(missing.action, 'approval');
    expect(() => inventory([missing]).prepare(base)).toThrow(
      'unsupported_action_metadata',
    );
    const unknown = calculation();
    unknown.action.data_exposure.classes[0] = 'unknown';
    expect(() => inventory([unknown]).prepare(base)).toThrow(
      'invalid_data_exposure',
    );
    expect(() =>
      inventory([calculation(), calculation()]).prepare(base),
    ).toThrow('duplicate_action_id');
    expect(() =>
      new OfflineActionInventory(new JsonDocument('[{"id":"x","id":"y"}]'), [
        calculation(),
      ]).prepare(base),
    ).toThrow('duplicate_json_member');
  });

  it('bounds capture, action count and final resource qualification', () => {
    expect(() =>
      withInput(object(Type.Literal('x'.repeat(1_000_001)))).prepare(base),
    ).toThrow('authoring_capture_invalid');
    let deep: TSchema = Type.Number();
    for (let depth = 0; depth < 40; depth++) deep = object(deep);
    expect(() => withInput(deep).prepare(base)).toThrow(
      'authoring_capture_invalid',
    );
    const nine = Array.from({ length: 9 }, (_, index) => ({
      ...greeting(),
      action: { ...greeting().action, id: `hello.${index}` },
    }));
    expect(() => inventory(nine).prepare(base)).toThrow(
      'schema_resource_count_limit',
    );
    const wide = Type.Object(
      Object.fromEntries(
        Array.from({ length: 65 }, (_, n) => [`x${n}`, Type.Number()]),
      ),
      { additionalProperties: false },
    );
    expect(() => withInput(wide).prepare(base)).toThrow(
      'schema_required_member_limit',
    );
    const one = Type.Object(
      Object.fromEntries(
        Array.from({ length: 40 }, (_, n) => [`x${n}`, Type.String()]),
      ),
      { additionalProperties: false },
    );
    const many = Array.from({ length: 8 }, (_, index) => ({
      action: { ...greeting().action, id: `hello.${index}` },
      input: one,
      output: one,
    }));
    expect(() => inventory(many).prepare(base)).toThrow(
      'schema_aggregate_node_limit',
    );
  });

  it('rejects an oversized array before enumerating all of its index keys', () => {
    const oversized = new Array(4097).fill(greeting());
    const ownKeys = vi.spyOn(Reflect, 'ownKeys');
    try {
      const captured = inventory(oversized);
      expect(ownKeys).not.toHaveBeenCalledWith(oversized);
      expect(() => captured.prepare(base)).toThrow('authoring_capture_invalid');
    } finally {
      ownKeys.mockRestore();
    }
  });
});

describe('closed TypeBox grammar', () => {
  it.each([
    Type.Optional(Type.String()),
    Type.Readonly(Type.String()),
    Type.Unsafe({ type: 'string' }),
    Type.Array(Type.String()),
    Type.Ref('https://external.test/schema'),
    Type.String({ format: 'email' }),
    Type.Number({ minimum: 0 }),
    Type.Transform(Type.String())
      .Decode((value) => value)
      .Encode((value) => value),
    Type.Object({ nested: Type.String() }),
    Type.Literal(1),
    Type.Union([Type.String(), Type.Number()]),
  ])('rejects unsupported schema %j', (schema) => {
    expect(() => withInput(object(schema)).prepare(base)).toThrow();
  });

  it.each([
    'missing',
    'mismatch',
    'custom-symbol',
    'container-symbol',
    'metadata-symbol',
    'hidden-key',
    'dialect',
    'id',
    'sparse',
    'required-extra',
    'required-missing',
    'required-duplicate',
  ])('rejects %s before it can disappear in JSON', (mutation) => {
    const declaration = calculation();
    const schema = declaration.input;
    switch (mutation) {
      case 'missing':
        Reflect.deleteProperty(schema, KIND);
        break;
      case 'mismatch':
        Reflect.set(schema, KIND, 'Number');
        break;
      case 'custom-symbol':
        Reflect.set(schema, Symbol('custom'), true);
        break;
      case 'container-symbol':
        Reflect.set(schema.properties, KIND, 'Object');
        break;
      case 'metadata-symbol':
        Reflect.set(
          declaration.action.data_exposure.redaction,
          Symbol('hidden'),
          true,
        );
        break;
      case 'hidden-key':
        Object.defineProperty(schema, 'hidden', {
          value: 'ignored',
          enumerable: false,
        });
        break;
      case 'dialect':
        Reflect.set(
          schema,
          '$schema',
          'https://json-schema.org/draft/2020-12/schema',
        );
        break;
      case 'id':
        Reflect.set(schema, '$id', 'https://example.test/');
        break;
      case 'sparse':
        Reflect.deleteProperty(defined(schema.required), '1');
        break;
      case 'required-extra':
        Reflect.set(
          defined(schema.required),
          schema.required?.length ?? 0,
          'missing',
        );
        break;
      case 'required-missing':
        defined(schema.required).pop();
        break;
      case 'required-duplicate':
        Reflect.set(defined(schema.required), '0', 'left');
        break;
    }
    expect(() => inventory([declaration]).prepare(base)).toThrow();
  });

  it('accepts empty objects with omitted or empty required and preserves enum ordering', () => {
    for (const schema of [
      Type.Object({}, { additionalProperties: false }),
      Type.Object({}, { additionalProperties: false, required: [] }),
    ])
      withInput(schema).prepare(base);
    const prepared = inventory().prepare(base);
    const schema = defined(prepared.schemaResources[0]).document.parse() as {
      properties: { operator: unknown };
    };
    expect(schema.properties.operator).toEqual({
      type: 'string',
      enum: ['add', 'subtract', 'multiply', 'divide'],
    });
  });

  it('accepts 32 distinct literals and rejects duplicate or 33-member unions', () => {
    const members = Array.from({ length: 32 }, (_, n) =>
      Type.Literal(String(n)),
    );
    withInput(object(Type.Union(members))).prepare(base);
    expect(() =>
      withInput(
        object(Type.Union([...members, Type.Literal('extra')])),
      ).prepare(base),
    ).toThrow('unsupported_action_union');
    expect(() =>
      withInput(
        object(Type.Union([Type.Literal('a'), Type.Literal('a')])),
      ).prepare(base),
    ).toThrow('unsupported_action_union');
  });
});

describe('publication compatibility', () => {
  it.each([
    [base, 'sha-256:M7iaIyuTAGywXxIfI718Bc95gq4W_3ck1ZwY_2a_W3M'],
    [
      'https://other.example.test/v2/',
      'sha-256:XP0ah3DPHWHZkVc4BJU_zEh2TAWZCJPNWUPaHijoYE0',
    ],
  ])('pins generated schemas, action metadata and hash at %s', (namespace, hash) => {
    const declaration = calculation();
    const prepared = inventory([declaration]).prepare(namespace);
    expect(defined(prepared.actionDocuments[0]).parse()).toEqual({
      ...declaration.action,
      input_schema: `${namespace}calculation.propose.input.json`,
      input_schema_hash: hash,
      output_schema: `${namespace}calculation.propose.output.json`,
    });
    const fields = {
      operator: {
        type: 'string',
        enum: ['add', 'subtract', 'multiply', 'divide'],
      },
      left: { type: 'number' },
      right: { type: 'number' },
    };
    expect(
      prepared.schemaResources.map((resource) => resource.document.parse()),
    ).toEqual([
      {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: `${namespace}calculation.propose.input.json`,
        type: 'object',
        properties: fields,
        additionalProperties: false,
        required: ['operator', 'left', 'right'],
      },
      {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: `${namespace}calculation.propose.output.json`,
        type: 'object',
        properties: { ...fields, result: { type: 'number' } },
        additionalProperties: false,
        required: ['operator', 'left', 'right', 'result'],
      },
    ]);
  });

  it('makes output-only hash invisibility explicit without sharing validators between inventories', () => {
    const first = greeting();
    const second = {
      ...greeting(),
      output: Type.Object(
        { greeting: Type.Number() },
        { additionalProperties: false },
      ),
    };
    const a = inventory([first]).prepare(base);
    const b = inventory([second]).prepare(base);
    expect(defined(a.actionDocuments[0]).parse()).toEqual(
      defined(b.actionDocuments[0]).parse(),
    );
    expect(composed(a).hash).toBe(composed(b).hash);
    const value = json({ greeting: 'Hello, world!' });
    a.validateOutput('greeting.propose', value);
    expect(() => b.validateOutput('greeting.propose', value)).toThrow(
      'schema_instance_invalid',
    );
    const oldResource = defined(a.schemaResources[1]).document.parse();
    const migrated = inventory([second]).prepare(
      'https://calcu.example.test/schemas/v2/',
    );
    expect(composed(migrated, '2').hash).not.toBe(composed(a).hash);
    expect(defined(a.schemaResources[1]).document.parse()).toEqual(oldResource);
    a.validateOutput('greeting.propose', value);
  });
});
