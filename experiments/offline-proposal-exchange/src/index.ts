import {
  CanonicalObjectHash,
  JsonDocument,
  type PreparedSchema,
} from '@0al/agent-surface';
import {
  ProposalReceiptPair,
  type ReceiptIntegrityChecked,
} from './receipt-pair.js';
import { CORRELATION_FIELDS, ProposalWire, positiveLimit } from './wire.js';

export {
  INLINE_RECEIPT_EXTENSION,
  INLINE_RECEIPT_PROFILE,
  OfflineInlineProposalExchange,
  type RetainedInlineProposalExchange,
} from './inline.js';
export type { ReceiptIntegrityChecked } from './receipt-pair.js';

const HASH = 'https://github.com/0al-spec/agent-surface/hash/';

/** No successful execution or authenticated receipt is established by this value. */
export interface PendingProposalEvidence {
  readonly status: 'evidence_required';
  unverifiedOutput(): JsonDocument;
  /** Original request/result values and computed output hash, not full host authority. */
  evidenceInputs(): JsonDocument;
  /** Complete unsigned selected receipts plus independently retained host context. */
  checkReceiptIntegrity(
    expectedContext: JsonDocument,
    runtimeReceipt: JsonDocument,
    applicationReceipt: JsonDocument,
    maximumReceiptBytes: number,
  ): ReceiptIntegrityChecked;
}

export interface RetainedProposalExchange {
  /** Validated request value. Serialization/property order need not match source bytes. */
  request(): JsonDocument;
  correlate(result: JsonDocument): PendingProposalEvidence;
}

/**
 * Private, offline value experiment, NOT an executor or incoming-request admission.
 * The host supplies its own original request BEFORE dispatch and the schema pair
 * selected from trusted declarations. This checks neither that selection nor the
 * current Grant/session/identity. No handler, transport or receipt callback exists.
 */
export class OfflineProposalExchange {
  readonly #originalRequest: JsonDocument;
  readonly #inputSchema: PreparedSchema;
  readonly #outputSchema: PreparedSchema;
  readonly #requestByteLimit: number;
  readonly #resultByteLimit: number;

  constructor(
    originalRequest: JsonDocument,
    inputSchema: PreparedSchema,
    outputSchema: PreparedSchema,
    requestByteLimit: number,
    resultByteLimit: number,
  ) {
    this.#originalRequest = originalRequest;
    this.#inputSchema = inputSchema;
    this.#outputSchema = outputSchema;
    this.#requestByteLimit = requestByteLimit;
    this.#resultByteLimit = resultByteLimit;
  }

  /** Strict parsing, schema checking and input/execution commitments, with no I/O. */
  prepare(): RetainedProposalExchange {
    positiveLimit(this.#resultByteLimit);
    const payload = new ProposalWire(
      this.#originalRequest,
      this.#requestByteLimit,
    ).request();
    const input = new JsonDocument(JSON.stringify(payload.input));
    validate(this.#inputSchema, input, 'proposal_input_schema_invalid');
    const inputHash = new CanonicalObjectHash(`${HASH}action-input/v1`).digest(
      input,
    );
    const execution = new JsonDocument(JSON.stringify(payload.execution));
    const executionHash = new CanonicalObjectHash(
      `${HASH}action-execution/v1`,
    ).digest(execution);
    if (
      payload.input_hash !== inputHash ||
      payload.execution_hash !== executionHash
    )
      throw new Error('proposal_request_hash_mismatch');

    // Retain owned text, not objects exposed to callers or schema collaborators.
    const requestText = JSON.stringify({ type: 'action.request', payload });
    if (Buffer.byteLength(requestText, 'utf8') > this.#requestByteLimit)
      throw new Error('json_byte_limit');
    return Object.freeze(
      new RetainedExchange(
        requestText,
        this.#outputSchema,
        this.#resultByteLimit,
      ),
    );
  }
}

class RetainedExchange implements RetainedProposalExchange {
  readonly #requestText: string;
  readonly #outputSchema: PreparedSchema;
  readonly #maximumResultBytes: number;

  constructor(
    requestText: string,
    outputSchema: PreparedSchema,
    maximumResultBytes: number,
  ) {
    this.#requestText = requestText;
    this.#outputSchema = outputSchema;
    this.#maximumResultBytes = maximumResultBytes;
  }

  request(): JsonDocument {
    return new JsonDocument(this.#requestText);
  }

  correlate(document: JsonDocument): PendingProposalEvidence {
    const result = new ProposalWire(
      document,
      this.#maximumResultBytes,
    ).result();
    const request = this.request().parse() as {
      payload: Record<string, unknown>;
    };
    for (const field of CORRELATION_FIELDS) {
      if (request.payload[field] !== result[field])
        throw new Error('proposal_correlation_mismatch');
    }
    const requestedExecution = request.payload.execution as Record<
      string,
      unknown
    >;
    const returnedExecution = result.execution as Record<string, unknown>;
    // Both objects are already closed: comparing their two primitive values is
    // exact JSON-value comparison without depending on property insertion order.
    if (
      requestedExecution.mode !== returnedExecution.mode ||
      requestedExecution.execution_id !== returnedExecution.execution_id
    )
      throw new Error('proposal_correlation_mismatch');
    if (request.payload.span_id === result.span_id)
      throw new Error('proposal_app_span_required');

    const outputText = JSON.stringify(result.output);
    validate(
      this.#outputSchema,
      new JsonDocument(outputText),
      'proposal_output_schema_invalid',
    );
    const outputHash = new CanonicalObjectHash(
      `${HASH}action-output/v1`,
    ).digest(new JsonDocument(outputText));
    return Object.freeze(
      new EvidencePending(
        outputText,
        JSON.stringify({
          request,
          result: { type: 'action.result', payload: result },
          output_hash: outputHash,
        }),
      ),
    );
  }
}

class EvidencePending implements PendingProposalEvidence {
  readonly status = 'evidence_required' as const;
  readonly #outputText: string;
  readonly #evidenceText: string;

  constructor(outputText: string, evidenceText: string) {
    this.#outputText = outputText;
    this.#evidenceText = evidenceText;
  }

  unverifiedOutput(): JsonDocument {
    return new JsonDocument(this.#outputText);
  }

  evidenceInputs(): JsonDocument {
    return new JsonDocument(this.#evidenceText);
  }

  checkReceiptIntegrity(
    expectedContext: JsonDocument,
    runtimeReceipt: JsonDocument,
    applicationReceipt: JsonDocument,
    maximumReceiptBytes: number,
  ): ReceiptIntegrityChecked {
    return new ProposalReceiptPair(
      this.#outputText,
      this.#evidenceText,
      expectedContext,
      runtimeReceipt,
      applicationReceipt,
      maximumReceiptBytes,
    ).check();
  }
}

function validate(
  schema: PreparedSchema,
  document: JsonDocument,
  diagnostic: string,
): void {
  try {
    const returned: unknown = schema.validate(document);
    if (returned instanceof Promise) void returned.catch(() => {});
    if (returned !== undefined) throw new Error(diagnostic);
  } catch {
    // A host collaborator's exception must not leak domain values in diagnostics.
    throw new Error(diagnostic);
  }
}
