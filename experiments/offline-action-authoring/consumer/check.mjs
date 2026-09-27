import assert from 'node:assert/strict';
import { CanonicalObjectHash, JsonDocument } from '@0al/agent-surface';
import {
  OfflineActionCatalog,
  OfflineActionDefinition,
} from '@0al/offline-action-authoring-prototype';
import { prepareCalcu } from '@0al/offline-action-authoring-prototype/consumers/calcu';
import {
  handlerCalls as helloHandlerCalls,
  prepareHello,
} from '@0al/offline-action-authoring-prototype/consumers/hello';
import { Type } from '@sinclair/typebox';

const withoutSchemaIdentity = ({ $schema, $id, ...schema }) => schema;
const removeRedundantType = (schema) => {
  if (Array.isArray(schema)) return schema.map(removeRedundantType);
  if (typeof schema !== 'object' || schema === null) return schema;
  const result = Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [
      key,
      removeRedundantType(value),
    ]),
  );
  if (('enum' in result || 'const' in result) && result.type === 'string')
    delete result.type;
  return result;
};
const hello = prepareHello();
const greeting = hello.actionDocuments[0].parse();
assert.deepEqual(
  {
    id: greeting.id,
    scope: greeting.scope,
    risk: greeting.risk,
    side_effect: greeting.side_effect,
    approval: greeting.approval,
    execution: greeting.execution,
    data_exposure: greeting.data_exposure,
  },
  {
    id: 'greeting.propose',
    scope: 'greeting.invoke',
    risk: 'propose',
    side_effect: false,
    approval: 'none',
    execution: {
      mode: 'propose',
      operation_id: 'greeting.propose',
      persisted: false,
    },
    data_exposure: {
      classes: ['hello.public-text'],
      redaction: { mode: 'none' },
      retention: { mode: 'user_managed' },
    },
  },
);
assert.equal('handler' in greeting, false);
hello.validateInput('greeting.propose', new JsonDocument('{}'));
hello.validateOutput(
  'greeting.propose',
  new JsonDocument('{"greeting":"Hello, world!"}'),
);
assert.equal(helloHandlerCalls, 0);
const helloSchema = hello.schemaResources
  .find(({ uri }) => uri === greeting.output_schema)
  .document.parse();
assert.deepEqual(removeRedundantType(withoutSchemaIdentity(helloSchema)), {
  type: 'object',
  properties: { greeting: { const: 'Hello, world!' } },
  required: ['greeting'],
  additionalProperties: false,
});
assert.equal(helloSchema.properties.greeting.type, 'string');
assert.notEqual(
  greeting.output_schema,
  'https://hello.example.invalid/schemas/greeting-output.json',
);

let calcuHandlerCalls = 0;
const calcu = prepareCalcu((input) => {
  calcuHandlerCalls += 1;
  return { ...input, result: 0 };
});
const calculation = calcu.actionDocuments[0].parse();
assert.equal(calculation.id, 'calculation.propose');
assert.match(calculation.input_schema_hash, /^sha-256:[A-Za-z0-9_-]+$/);
const calcuInput = calcu.schemaResources
  .find(({ uri }) => uri === calculation.input_schema)
  .document.parse();
const calcuOutput = calcu.schemaResources
  .find(({ uri }) => uri === calculation.output_schema)
  .document.parse();
const baselineCalcuInput = {
  type: 'object',
  properties: {
    operator: { enum: ['add', 'subtract', 'multiply', 'divide'] },
    left: { type: 'number' },
    right: { type: 'number' },
  },
  required: ['operator', 'left', 'right'],
  additionalProperties: false,
};
const baselineCalcuOutput = {
  type: 'object',
  properties: {
    operator: { enum: ['add', 'subtract', 'multiply', 'divide'] },
    left: { type: 'number' },
    right: { type: 'number' },
    result: { type: 'number' },
  },
  required: ['operator', 'left', 'right', 'result'],
  additionalProperties: false,
};
assert.deepEqual(
  removeRedundantType(withoutSchemaIdentity(calcuInput)),
  baselineCalcuInput,
);
assert.deepEqual(calcuInput.properties.operator, {
  type: 'string',
  enum: ['add', 'subtract', 'multiply', 'divide'],
});
assert.deepEqual(
  removeRedundantType(withoutSchemaIdentity(calcuOutput)),
  baselineCalcuOutput,
);
assert.equal(calcuInput.properties.operator.type, 'string');
assert.deepEqual(
  {
    id: calculation.id,
    scope: calculation.scope,
    risk: calculation.risk,
    side_effect: calculation.side_effect,
    approval: calculation.approval,
    execution: calculation.execution,
    data_exposure: calculation.data_exposure,
  },
  {
    id: 'calculation.propose',
    scope: 'calculation.propose',
    risk: 'propose',
    side_effect: false,
    approval: 'none',
    execution: {
      mode: 'propose',
      operation_id: 'calculation.propose.operation',
      persisted: false,
    },
    data_exposure: {
      classes: ['application.result'],
      redaction: { mode: 'none' },
      retention: { mode: 'user_managed' },
    },
  },
);
assert.equal(
  calculation.input_schema_hash,
  new CanonicalObjectHash(
    'https://github.com/0al-spec/agent-surface/hash/action-input-schema/v1',
  ).digest(new JsonDocument(JSON.stringify(calcuInput))),
);
const priorUnsafeInput = {
  ...calcuInput,
  properties: {
    ...calcuInput.properties,
    operator: {
      type: 'string',
      enum: ['add', 'subtract', 'multiply', 'divide'],
    },
  },
};
assert.equal(
  calculation.input_schema_hash,
  new CanonicalObjectHash(
    'https://github.com/0al-spec/agent-surface/hash/action-input-schema/v1',
  ).digest(new JsonDocument(JSON.stringify(priorUnsafeInput))),
  'literal-union lowering preserves the former Unsafe enum schema and hash',
);
const calcuBaselineUri =
  'https://calcu.local/schemas/calculation.propose.input.json';
assert.notEqual(calculation.input_schema, calcuBaselineUri);
assert.notEqual(
  calculation.input_schema_hash,
  new CanonicalObjectHash(
    'https://github.com/0al-spec/agent-surface/hash/action-input-schema/v1',
  ).digest(
    new JsonDocument(JSON.stringify({ ...calcuInput, $id: calcuBaselineUri })),
  ),
  'schema URI is part of the hashed schema document',
);
const input = new JsonDocument(
  '{"operator":"multiply","left":240,"right":0.15}',
);
const result = new JsonDocument(
  '{"operator":"multiply","left":240,"right":0.15,"result":36}',
);
calcu.validateInput('calculation.propose', input);
calcu.validateOutput('calculation.propose', result);
assert.equal(calcuHandlerCalls, 0);
assert.equal(JSON.stringify(calculation).includes('grant'), false);
assert.equal(JSON.stringify(calculation).includes('credential'), false);

assert.throws(
  () => calcu.validateInput('calculation.unknown', input),
  /action_not_declared/,
);
for (const operator of ['add', 'subtract', 'multiply', 'divide']) {
  calcu.validateInput(
    'calculation.propose',
    new JsonDocument(JSON.stringify({ operator, left: 7, right: 3 })),
  );
}
for (const operator of ['sqrt', 'power', 'modulo', '']) {
  assert.throws(
    () =>
      calcu.validateInput(
        'calculation.propose',
        new JsonDocument(JSON.stringify({ operator, left: 7, right: 3 })),
      ),
    /schema_instance_invalid/,
  );
}
assert.throws(
  () =>
    calcu.validateInput(
      'calculation.propose',
      new JsonDocument('{"operator":"sqrt","left":111,"right":2}'),
    ),
  /schema_instance_invalid/,
);

const definition = JSON.parse(JSON.stringify(calculation));
delete definition.input_schema;
delete definition.input_schema_hash;
delete definition.output_schema;
const classes = new JsonDocument(
  '[{"id":"application.result","classification":"private","label":"Result","description":"App output."}]',
);
const base = {
  action: definition,
  input: Type.Object({}, { additionalProperties: false, required: [] }),
  output: Type.Object({}, { additionalProperties: false, required: [] }),
  handler: () => ({}),
};
const initialDefinition = new OfflineActionDefinition(base);
const callerDefinitions = [initialDefinition];
const membershipSnapshot = new OfflineActionCatalog(classes, callerDefinitions);
callerDefinitions.splice(0, 1);
callerDefinitions.push(
  new OfflineActionDefinition({
    ...base,
    action: {
      ...base.action,
      id: 'calculation.replacement',
      scope: 'calculation.replacement',
      execution: {
        ...base.action.execution,
        operation_id: 'calculation.replacement',
      },
    },
  }),
);
assert.deepEqual(
  membershipSnapshot
    .prepare('https://membership.example/schemas/')
    .actionDocuments.map((document) => document.parse().id),
  ['calculation.propose'],
);
const firstPreparation = membershipSnapshot.prepare(
  'https://membership.example/schemas',
);
assert.equal(
  membershipSnapshot.prepare('https://membership.example/schemas/'),
  firstPreparation,
);
assert.throws(
  () => membershipSnapshot.prepare('https://different.example/schemas/'),
  /schema_base_uri_changed/,
);
assert.throws(
  () => membershipSnapshot.prepare('not a URI'),
  /invalid_schema_base_uri/,
);

for (const malformed of [
  { ...base, action: null },
  { ...base, action: { ...base.action, execution: null } },
  { ...base, action: { ...base.action, data_exposure: null } },
  { ...base, handler: null },
  { action: base.action, input: base.input, output: base.output },
  { ...base, action: { ...base.action, approval: undefined } },
  { ...base, input: null },
]) {
  assert.throws(() =>
    new OfflineActionCatalog(classes, [
      new OfflineActionDefinition(malformed),
    ]).prepare('https://malformed.example/schemas/'),
  );
}
for (const nestedInput of [
  Type.Object(
    { values: Type.Array(Type.Object({}, { additionalProperties: true })) },
    { additionalProperties: false },
  ),
  Type.Unsafe({
    type: 'object',
    properties: { nested: { $ref: '#/$defs/nested' } },
    additionalProperties: false,
    $defs: {
      nested: { type: 'object', properties: {}, additionalProperties: true },
    },
  }),
]) {
  assert.throws(
    () =>
      new OfflineActionCatalog(classes, [
        new OfflineActionDefinition({ ...base, input: nestedInput }),
      ]).prepare('https://nested.example/schemas/'),
    /action_schema_must_be_closed_object/,
  );
}

const ownedInput = Type.Object(
  {
    nested: Type.Object(
      { value: Type.String() },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
const ownedAction = JSON.parse(JSON.stringify(base.action));
const ownedDefinition = { ...base, action: ownedAction, input: ownedInput };
const beforeCallerValues = JSON.stringify(ownedDefinition);
new OfflineActionCatalog(classes, [
  new OfflineActionDefinition(ownedDefinition),
]).prepare('https://immutable.example/schemas/');
assert.equal(JSON.stringify(ownedDefinition), beforeCallerValues);
assert.throws(
  () =>
    new OfflineActionCatalog(classes, [
      new OfflineActionDefinition({
        ...base,
        input: Type.Object({}, { additionalProperties: true, required: [] }),
      }),
    ]).prepare('https://invalid.example/schemas/'),
  /action_schema_must_be_closed_object/,
);

// Declaration data and handler identity are captured before the first prepare.
const sourceOperator = Type.Union([
  Type.Literal('add'),
  Type.Literal('subtract'),
  Type.Literal('multiply'),
  Type.Literal('divide'),
]);
const sourceNestedInput = Type.Object(
  {
    nested: Type.Object(
      { value: Type.String() },
      { additionalProperties: false },
    ),
    operator: sourceOperator,
  },
  { additionalProperties: false },
);
const sourceAction = JSON.parse(JSON.stringify(base.action));
let sourceHandlerCalls = 0;
const sourceHandler = () => {
  sourceHandlerCalls += 1;
  return { result: 'original' };
};
const sourceDefinition = {
  ...base,
  action: sourceAction,
  input: sourceNestedInput,
  handler: sourceHandler,
};
const snapshot = new OfflineActionDefinition(sourceDefinition);
sourceAction.id = 'changed.after.construction';
sourceAction.execution.operation_id = 'changed.operation';
sourceAction.data_exposure.classes[0] = 'changed.class';
sourceAction.data_exposure.redaction.mode = 'policy';
sourceAction.data_exposure.retention.mode = 'bounded';
sourceNestedInput.properties.nested.properties.value.type = 'number';
sourceNestedInput.required.push('injected');
sourceOperator.anyOf[0].const = 'sqrt';
sourceDefinition.handler = () => ({ result: 'replacement' });
const snapshotCatalog = new OfflineActionCatalog(classes, [snapshot]);
const captured = snapshotCatalog.prepare('https://snapshot.example/schemas/');
const capturedAction = captured.actionDocuments[0].parse();
assert.equal(capturedAction.id, 'calculation.propose');
assert.equal(
  capturedAction.execution.operation_id,
  'calculation.propose.operation',
);
assert.deepEqual(capturedAction.data_exposure.classes, ['application.result']);
assert.deepEqual(capturedAction.data_exposure.redaction, { mode: 'none' });
assert.deepEqual(capturedAction.data_exposure.retention, {
  mode: 'user_managed',
});
assert.equal(sourceHandlerCalls, 0);
const capturedInput = captured.schemaResources
  .find(({ uri }) => uri === capturedAction.input_schema)
  .document.parse();
assert.deepEqual(capturedInput.properties.nested.properties.value, {
  type: 'string',
});
assert.deepEqual(capturedInput.required, ['nested', 'operator']);
assert.deepEqual(capturedInput.properties.operator, {
  type: 'string',
  enum: ['add', 'subtract', 'multiply', 'divide'],
});
assert.equal(Object.isFrozen(sourceAction), false);
assert.equal(Object.isFrozen(sourceAction.execution), false);
assert.equal(Object.isFrozen(sourceAction.data_exposure.classes), false);
assert.equal(Object.isFrozen(sourceNestedInput), false);
sourceAction.scope = 'changed.after.prepare';
sourceNestedInput.properties.nested.properties.value.type = 'boolean';
sourceOperator.anyOf[1].const = 'power';
assert.equal(captured.actionDocuments[0].parse().scope, 'calculation.propose');
assert.deepEqual(capturedInput.properties.nested.properties.value, {
  type: 'string',
});
assert.deepEqual(capturedInput.properties.operator.enum, [
  'add',
  'subtract',
  'multiply',
  'divide',
]);

let getterCalls = 0;
const accessorAction = Object.defineProperty({}, 'id', {
  enumerable: true,
  get() {
    getterCalls += 1;
    return 'getter.action';
  },
});
const accessorDefinition = { ...base, action: accessorAction };
const accessorSnapshot = new OfflineActionDefinition(accessorDefinition);
assert.equal(getterCalls, 0);
assert.throws(
  () =>
    new OfflineActionCatalog(classes, [accessorSnapshot]).prepare(
      'https://accessor.example/schemas/',
    ),
  /invalid_action_definition/,
);
assert.equal(getterCalls, 0);

const annotatedUnion = Type.Union([Type.Literal('x'), Type.Literal('y')]);
annotatedUnion.anyOf[1].description = 'must not be dropped';
for (const unsupportedUnion of [
  Type.Union([Type.Literal('x'), Type.Number()]),
  Type.Union([Type.String(), Type.Literal('x')]),
  Type.Union([Type.Literal('x'), Type.Literal('x')]),
  Type.Union([Type.Literal('x'), Type.Literal('y')], { title: 'annotated' }),
  annotatedUnion,
]) {
  assert.throws(
    () =>
      new OfflineActionCatalog(classes, [
        new OfflineActionDefinition({
          ...base,
          input: Type.Object(
            { value: unsupportedUnion },
            { additionalProperties: false },
          ),
        }),
      ]).prepare('https://union-reject.example/schemas/'),
    /unsupported_action_union/,
  );
}

const unionLikePayload = { anyOf: [{ const: 'payload-data' }] };
unionLikePayload[Symbol.for('TypeBox.Kind')] = 'Union';
const payloadCatalog = new OfflineActionCatalog(classes, [
  new OfflineActionDefinition({
    ...base,
    input: Type.Unsafe({
      type: 'object',
      properties: {
        value: {
          const: unionLikePayload,
          default: unionLikePayload,
          examples: [unionLikePayload],
        },
      },
      required: ['value'],
      additionalProperties: false,
    }),
  }),
]);
const payload = payloadCatalog
  .prepare('https://literal-payload.example/schemas/')
  .schemaResources[0].document.parse().properties.value;
const serializedUnionLikePayload = JSON.parse(JSON.stringify(unionLikePayload));
assert.deepEqual(payload.const, serializedUnionLikePayload);
assert.deepEqual(payload.default, serializedUnionLikePayload);
assert.deepEqual(payload.examples, [serializedUnionLikePayload]);

const cyclicSchema = Type.Unsafe({
  type: 'object',
  properties: {},
  additionalProperties: false,
});
cyclicSchema.properties.self = cyclicSchema;
assert.throws(
  () =>
    new OfflineActionCatalog(classes, [
      new OfflineActionDefinition({ ...base, input: cyclicSchema }),
    ]).prepare('https://cycle.example/schemas/'),
  /invalid_action_definition/,
);

let sharedBranch = { type: 'string' };
for (let depth = 0; depth < 6; depth += 1) {
  sharedBranch = {
    type: 'object',
    properties: { a: sharedBranch, b: sharedBranch, c: sharedBranch },
    additionalProperties: false,
  };
}
const expandingSchema = Type.Unsafe({
  type: 'object',
  properties: { a: sharedBranch, b: sharedBranch, c: sharedBranch },
  additionalProperties: false,
});
assert.throws(
  () =>
    new OfflineActionCatalog(classes, [
      new OfflineActionDefinition({ ...base, input: expandingSchema }),
    ]).prepare('https://bounded-schema.example/schemas/'),
  /invalid_action_definition|action_schema_complexity_exceeded/,
);
assert.throws(
  () =>
    new OfflineActionCatalog(classes, [
      new OfflineActionDefinition(base),
      new OfflineActionDefinition(base),
    ]).prepare('https://invalid.example/schemas/'),
  /duplicate_action_id/,
);
assert.throws(
  () =>
    new OfflineActionCatalog(classes, [
      new OfflineActionDefinition({
        ...base,
        action: { ...base.action, unrestricted: true },
      }),
    ]).prepare('https://invalid.example/schemas/'),
  /unsupported_action_metadata/,
);
assert.throws(
  () =>
    new OfflineActionCatalog(classes, [
      new OfflineActionDefinition({
        ...base,
        input: Type.Object(
          { nested: Type.Object({}, { additionalProperties: true }) },
          { additionalProperties: false },
        ),
      }),
    ]).prepare('https://invalid.example/schemas/'),
  /action_schema_must_be_closed_object/,
);
assert.throws(
  () =>
    new OfflineActionCatalog(classes, [
      new OfflineActionDefinition({
        ...base,
        input: Type.Object(
          {
            unsupported: Type.Unsafe({
              anyOf: [{ type: 'string' }, { type: 'number' }],
            }),
          },
          { additionalProperties: false },
        ),
      }),
    ]).prepare('https://invalid.example/schemas/'),
  /schema_keyword_unsupported/,
);

process.stdout.write('offline action authoring consumer checks passed\n');
