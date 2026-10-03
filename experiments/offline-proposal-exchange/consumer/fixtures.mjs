import {
  CanonicalObjectHash,
  JsonDocument,
  OfflineSchemaResources,
} from '@0al/agent-surface';

export const json = (value) => new JsonDocument(JSON.stringify(value));
export const hash = (kind, value) =>
  new CanonicalObjectHash(
    `https://github.com/0al-spec/agent-surface/hash/${kind}/v1`,
  ).digest(json(value));
export const ZERO_HASH = `sha-256:${'A'.repeat(43)}`;
export const OTHER_HASH = `sha-256:${'B'.repeat(42)}A`;
export const object = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/** Synthetic offline vectors only: no valid Grant or authenticated receipts. */
export function fixture(kind = 'calcu') {
  const calcu = kind === 'calcu';
  const operation = {
    operator: {
      type: 'string',
      enum: ['add', 'subtract', 'multiply', 'divide'],
    },
    left: { type: 'number' },
    right: { type: 'number' },
  };
  const inputSchema = calcu
    ? object(operation)
    : object({
        recipients: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 10,
        },
        style: object({
          prefix: { type: 'string' },
          punctuation: { type: 'string' },
        }),
      });
  const outputSchema = calcu
    ? object({ ...operation, result: { type: 'number' } })
    : object({
        messages: { type: 'array', items: { type: 'string' }, maxItems: 10 },
      });
  const schemas = new OfflineSchemaResources(
    [inputSchema, outputSchema].map((schema, index) => ({
      uri: `https://example.test/${kind}/${index}`,
      document: json({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: `https://example.test/${kind}/${index}`,
        ...schema,
      }),
    })),
  ).prepare();
  const input = calcu
    ? { operator: 'multiply', left: 240, right: 0.15 }
    : {
        recipients: ['Ada', 'Zoë'],
        style: { prefix: 'Hello', punctuation: '!' },
      };
  const output = calcu
    ? { ...input, result: 36 }
    : { messages: ['Hello, Ada!', 'Hello, Zoë!'] };
  const execution = { mode: 'propose', execution_id: 'execution-1' };
  const shared = {
    session_id: 'session-1',
    session_generation: 1,
    grant_id: 'grant-1',
    grant_hash: ZERO_HASH,
    surface_hash: ZERO_HASH,
    action_id: calcu ? 'calculation.propose' : 'greeting.propose',
    idempotency_key: 'invocation-1',
    trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
    execution,
    execution_hash: hash('action-execution', execution),
  };
  return {
    input,
    output,
    inputSchema: schemas.resolve(`https://example.test/${kind}/0`),
    outputSchema: schemas.resolve(`https://example.test/${kind}/1`),
    request: {
      type: 'action.request',
      payload: {
        ...shared,
        span_id: 'b7ad6b7169203331',
        parent_receipt_hash: ZERO_HASH,
        input_hash: hash('action-input', input),
        input,
      },
    },
    response: {
      type: 'action.result',
      payload: {
        ...structuredClone(shared),
        span_id: '00f067aa0ba902b7',
        result: 'success',
        output,
        receipt_id: 'receipt-app-1',
        receipt_hash: ZERO_HASH,
      },
    },
  };
}
