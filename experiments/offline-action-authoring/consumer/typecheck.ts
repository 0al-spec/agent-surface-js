import { JsonDocument } from '@0al/agent-surface';
import {
  OfflineActionCatalog,
  OfflineActionDefinition,
} from '@0al/offline-action-authoring-prototype';
import {
  type CalculationInput,
  prepareCalcu,
} from '@0al/offline-action-authoring-prototype/consumers/calcu';
import { Type } from '@sinclair/typebox';

const input = Type.Object({}, { additionalProperties: false, required: [] });
const output = Type.Object(
  { greeting: Type.Literal('Hello, world!') },
  { additionalProperties: false },
);

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
  input,
  output,
  handler: () => ({ greeting: 'Hello, world!' as const }),
});

new OfflineActionCatalog(new JsonDocument('[]'), [greeting]);
prepareCalcu(() => {
  throw new Error('offline preparation must not execute application logic');
});

const validCalculationInput: CalculationInput = {
  operator: 'multiply',
  left: 2,
  right: 3,
};
void validCalculationInput;

const invalidCalculationInput: CalculationInput = {
  // @ts-expect-error inferred operator union excludes unsupported values
  operator: 'sqrt',
  left: 2,
  right: 3,
};
void invalidCalculationInput;

// @ts-expect-error handler results must match the inferred output schema
prepareCalcu(() => ({ operator: 'add', left: 1, right: 2, result: 'wrong' }));
