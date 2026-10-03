import { JsonDocument } from '@0al/agent-surface';
import {
  type ActionDeclaration,
  type ActionInput,
  type ActionOutput,
  OfflineActionInventory,
} from '@0al/agent-surface/authoring';
import { Type } from '@sinclair/typebox';

const fields = {
  operator: Type.Union([
    Type.Literal('add'),
    Type.Literal('subtract'),
    Type.Literal('multiply'),
    Type.Literal('divide'),
  ]),
  left: Type.Number(),
  right: Type.Number(),
};
const metadata = {
  id: 'calculation.propose',
  scope: 'calculation.propose',
  risk: 'propose',
  side_effect: false,
  approval: 'none',
  input_hash_profile: 'asp-jcs-sha-256',
  execution: {
    mode: 'propose',
    operation_id: 'calculation.prepare',
    persisted: false,
  },
  data_exposure: {
    classes: ['application.result'],
    redaction: { mode: 'none' },
    retention: { mode: 'user_managed' },
  },
} as const;
const calculation = {
  action: metadata,
  input: Type.Object(fields, { additionalProperties: false }),
  output: Type.Object(
    { ...fields, result: Type.Number() },
    { additionalProperties: false },
  ),
} satisfies ActionDeclaration;
const greeting = {
  action: { ...metadata, id: 'greeting.propose', scope: 'greeting.invoke' },
  input: Type.Object({}, { additionalProperties: false }),
  output: Type.Object(
    { greeting: Type.Literal('Hello, world!') },
    { additionalProperties: false },
  ),
} satisfies ActionDeclaration;

// Native domain types need not import the SDK or TypeBox.
interface NativeInput {
  operator: 'add' | 'subtract' | 'multiply' | 'divide';
  left: number;
  right: number;
}
interface NativeOutput extends NativeInput {
  result: number;
}
const nativeInput: NativeInput = {
  operator: 'multiply',
  left: 240,
  right: 0.15,
};
const inferredInput: ActionInput<typeof calculation> = nativeInput;
const inputBack: NativeInput = inferredInput;
const nativeOutput: NativeOutput = { ...inputBack, result: 36 };
const inferredOutput: ActionOutput<typeof calculation> = nativeOutput;
const outputBack: NativeOutput = inferredOutput;
const badInput: ActionInput<typeof calculation> = {
  // @ts-expect-error unsupported operator must remain a compile-time error
  operator: 'sqrt',
  left: 111,
  right: 2,
};
const badOutput: ActionOutput<typeof calculation> = {
  ...nativeInput,
  // @ts-expect-error inferred numeric output cannot be a string
  result: '36',
};
const executable: ActionDeclaration = {
  ...calculation,
  // @ts-expect-error descriptor-only authoring has no handler field
  handler: () => nativeOutput,
};
void [badInput, badOutput, executable];

const catalog = new JsonDocument(
  JSON.stringify([
    {
      id: 'application.result',
      classification: 'private',
      label: 'Result',
      description:
        'A classification chosen by this example, not inferred by the SDK.',
    },
  ]),
);
const prepared = new OfflineActionInventory(catalog, [
  calculation,
  greeting,
]).prepare('https://consumer.example.test/schemas/v1/');
prepared.validateInput(
  'calculation.propose',
  new JsonDocument(JSON.stringify(inputBack)),
);
prepared.validateOutput(
  'calculation.propose',
  new JsonDocument(JSON.stringify(outputBack)),
);
prepared.validateInput('greeting.propose', new JsonDocument('{}'));
prepared.validateOutput(
  'greeting.propose',
  new JsonDocument('{"greeting":"Hello, world!"}'),
);
if (
  prepared.actionDocuments.length !== 2 ||
  prepared.schemaResources.length !== 4
)
  throw new Error('consumer_inventory_mismatch');
console.log(
  'packed authoring consumer passed; no handler called or authority issued',
);
