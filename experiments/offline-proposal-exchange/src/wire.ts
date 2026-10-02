import { JsonDocument } from '@0al/agent-surface';

type RecordValue = Record<string, unknown>;

export const CORRELATION_FIELDS = [
  'session_id',
  'session_generation',
  'grant_id',
  'grant_hash',
  'surface_hash',
  'action_id',
  'idempotency_key',
  'trace_id',
  'execution_hash',
] as const;

const COMMON_FIELDS = [...CORRELATION_FIELDS, 'span_id', 'execution'];
const REQUEST_FIELDS = [
  ...COMMON_FIELDS,
  'parent_receipt_hash',
  'input_hash',
  'input',
];
const RESULT_FIELDS = [
  ...COMMON_FIELDS,
  'result',
  'output',
  'receipt_id',
  'receipt_hash',
];

/** Closed JSON control grammar; domain input/output are checked separately. */
export class ProposalWire {
  readonly #document: JsonDocument;
  readonly #maximumBytes: number;

  constructor(document: JsonDocument, maximumBytes: number) {
    this.#document = document;
    this.#maximumBytes = maximumBytes;
  }

  request(): RecordValue {
    const payload = this.#payload('action.request', REQUEST_FIELDS);
    digest(payload.input_hash);
    digest(payload.parent_receipt_hash);
    return payload;
  }

  result(): RecordValue {
    const payload = this.#payload('action.result', RESULT_FIELDS);
    if (payload.result !== 'success')
      throw new Error('proposal_result_unsupported');
    identifier(payload.receipt_id, 256);
    digest(payload.receipt_hash);
    return payload;
  }

  #payload(type: string, fields: readonly string[]): RecordValue {
    positiveLimit(this.#maximumBytes);
    if (!(this.#document instanceof JsonDocument))
      throw new Error('proposal_document_invalid');
    const message = closed(this.#document.parse(this.#maximumBytes), [
      'type',
      'payload',
    ]);
    if (message.type !== type) throw new Error('proposal_message_unsupported');
    const payload = closed(message.payload, fields);
    for (const field of ['session_id', 'grant_id', 'action_id'])
      identifier(payload[field], 256);
    identifier(payload.idempotency_key, 128);
    if (
      typeof payload.session_generation !== 'number' ||
      !Number.isSafeInteger(payload.session_generation) ||
      payload.session_generation <= 0
    )
      throw new Error('proposal_generation_invalid');
    for (const field of ['grant_hash', 'surface_hash', 'execution_hash'])
      digest(payload[field]);
    trace(payload.trace_id, 32);
    trace(payload.span_id, 16);
    const execution = closed(payload.execution, ['mode', 'execution_id']);
    if (execution.mode !== 'propose')
      throw new Error('proposal_mode_unsupported');
    identifier(execution.execution_id, 128);
    return payload;
  }
}

export function positiveLimit(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error('proposal_byte_limit_invalid');
}

function closed(value: unknown, fields: readonly string[]): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('proposal_shape_invalid');
  const record = value as RecordValue;
  if (
    Object.keys(record).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(record, field))
  )
    throw new Error('proposal_shape_invalid');
  return record;
}

function identifier(value: unknown, maximum: number): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum)
    throw new Error('proposal_identifier_invalid');
}

function trace(value: unknown, digits: number): void {
  if (
    typeof value !== 'string' ||
    value.length !== digits ||
    !/^[0-9a-f]+$/u.test(value) ||
    /^0+$/u.test(value)
  )
    throw new Error('proposal_trace_invalid');
}

function digest(value: unknown): void {
  if (typeof value !== 'string' || !/^sha-256:[A-Za-z0-9_-]{43}$/u.test(value))
    throw new Error('proposal_digest_invalid');
  const encoded = value.slice('sha-256:'.length);
  const bytes = Buffer.from(encoded, 'base64url');
  if (bytes.length !== 32 || bytes.toString('base64url') !== encoded)
    throw new Error('proposal_digest_invalid');
}
