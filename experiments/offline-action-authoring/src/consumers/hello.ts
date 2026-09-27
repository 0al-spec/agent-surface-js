import { JsonDocument } from '@0al/agent-surface';
import { Type } from '@sinclair/typebox';
import { OfflineActionCatalog, OfflineActionDefinition } from '../index.js';

const greetingInput = Type.Object(
  {},
  { additionalProperties: false, required: [] },
);
const greetingOutput = Type.Object(
  { greeting: Type.Literal('Hello, world!') },
  { additionalProperties: false },
);

export let handlerCalls = 0;

const greeting = new OfflineActionDefinition({
  action: {
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
  input: greetingInput,
  output: greetingOutput,
  handler: () => {
    handlerCalls += 1;
    return { greeting: 'Hello, world!' } as const;
  },
});

const catalog = new OfflineActionCatalog(
  new JsonDocument(
    JSON.stringify([
      {
        id: 'hello.public-text',
        classification: 'public',
        label: 'Fixed greeting',
        description: 'A fixed greeting returned by the application.',
      },
    ]),
  ),
  [greeting],
);

export function prepareHello() {
  return catalog.prepare('https://hello.example.test/schemas/');
}
