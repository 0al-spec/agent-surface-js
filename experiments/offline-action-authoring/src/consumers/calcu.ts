import { JsonDocument } from '@0al/agent-surface';
import { type Static, Type } from '@sinclair/typebox';
import { OfflineActionCatalog, OfflineActionDefinition } from '../index.js';

const operatorSchema = Type.Union([
  Type.Literal('add'),
  Type.Literal('subtract'),
  Type.Literal('multiply'),
  Type.Literal('divide'),
]);
const calculationFields = {
  operator: operatorSchema,
  left: Type.Number(),
  right: Type.Number(),
};
const calculationInput = Type.Object(calculationFields, {
  additionalProperties: false,
});
const calculationOutput = Type.Object(
  {
    ...calculationFields,
    result: Type.Number(),
  },
  { additionalProperties: false },
);

export type CalculationInput = Static<typeof calculationInput>;
export type CalculationOutput = Static<typeof calculationOutput>;

export type CalculationHandler = (
  input: CalculationInput,
) => CalculationOutput | Promise<CalculationOutput>;

export function prepareCalcu(handler: CalculationHandler) {
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
    handler,
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
  return catalog.prepare('https://calcu.example.test/schemas/');
}
