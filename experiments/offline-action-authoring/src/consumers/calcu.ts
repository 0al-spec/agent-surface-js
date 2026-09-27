import { JsonDocument } from '@0al/agent-surface';
import { type Static, Type } from '@sinclair/typebox';
import { OfflineActionCatalog, OfflineActionDefinition } from '../index.js';

const operators = ['add', 'subtract', 'multiply', 'divide'] as const;
type Operator = (typeof operators)[number];
const operatorSchema = Type.Unsafe<Operator>({
  type: 'string',
  enum: [...operators],
});
const calculationInput = Type.Object(
  {
    operator: operatorSchema,
    left: Type.Number(),
    right: Type.Number(),
  },
  { additionalProperties: false },
);
const calculationOutput = Type.Object(
  {
    operator: operatorSchema,
    left: Type.Number(),
    right: Type.Number(),
    result: Type.Number(),
  },
  { additionalProperties: false },
);

export type CalculationInput = Static<typeof calculationInput>;
export type CalculationOutput = Static<typeof calculationOutput>;
export let handlerCalls = 0;

const calculation = new OfflineActionDefinition({
  action: {
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
  input: calculationInput,
  output: calculationOutput,
  handler: (input: CalculationInput): CalculationOutput => {
    handlerCalls += 1;
    const result =
      input.operator === 'add'
        ? input.left + input.right
        : input.operator === 'subtract'
          ? input.left - input.right
          : input.operator === 'multiply'
            ? input.left * input.right
            : input.left / input.right;
    return { ...input, result };
  },
});

const catalog = new OfflineActionCatalog(
  new JsonDocument(
    JSON.stringify([
      {
        id: 'application.result',
        classification: 'private',
        label: 'Application result',
        description: 'Application-owned calculation result.',
      },
    ]),
  ),
  [calculation],
);

export function prepareCalcu() {
  return catalog.prepare('https://calcu.example.test/schemas/');
}
