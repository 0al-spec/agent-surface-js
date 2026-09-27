import assert from 'node:assert/strict';
import { JsonDocument } from '@0al/agent-surface';
import {
  OfflineActionCatalog,
  OfflineActionDefinition,
} from '@0al/offline-action-authoring-prototype';
import {
  handlerCalls as calcuHandlerCalls,
  prepareCalcu,
} from '@0al/offline-action-authoring-prototype/consumers/calcu';
import {
  handlerCalls as helloHandlerCalls,
  prepareHello,
} from '@0al/offline-action-authoring-prototype/consumers/hello';
import { Type } from '@sinclair/typebox';

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
  },
);
assert.equal('handler' in greeting, false);
hello.validateInput('greeting.propose', new JsonDocument('{}'));
hello.validateOutput(
  'greeting.propose',
  new JsonDocument('{"greeting":"Hello, world!"}'),
);
assert.equal(helloHandlerCalls, 0);

const calcu = prepareCalcu();
const calculation = calcu.actionDocuments[0].parse();
assert.equal(calculation.id, 'calculation.propose');
assert.match(calculation.input_schema_hash, /^sha-256:[A-Za-z0-9_-]+$/);
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
