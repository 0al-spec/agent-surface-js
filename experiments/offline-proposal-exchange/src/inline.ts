import {
  JsonDocument,
  type PreparedOfflineProposalManifest,
  type PreparedOfflineSelectedGrant,
} from '@0al/agent-surface';
import {
  OfflineProposalExchange,
  type RetainedProposalExchange,
} from './index.js';
import {
  ProposalReceiptPair,
  type ReceiptIntegrityChecked,
} from './receipt-pair.js';
import { closed, positiveLimit } from './wire.js';

export const INLINE_RECEIPT_PROFILE =
  'https://github.com/0al-spec/agent-surface/profiles/http-inline-receipts/v1';
export const INLINE_RECEIPT_EXTENSION =
  'https://github.com/0al-spec/agent-surface/extensions/http-inline-receipts/v1';

export interface RetainedInlineProposalExchange {
  request(): JsonDocument;
  checkReceiptIntegrity(result: JsonDocument): ReceiptIntegrityChecked;
}

/**
 * Private offline representation experiment. Host-selected collaborators and
 * context are trusted inputs, not objects supplied by a model/HTTP peer. This
 * checks no transport, authentication, current authority, or application admission.
 */
export class OfflineInlineProposalExchange {
  readonly #manifest: PreparedOfflineProposalManifest;
  readonly #grant: PreparedOfflineSelectedGrant;
  readonly #request: JsonDocument;
  readonly #expected: JsonDocument;
  readonly #maximumBytes: number;

  constructor(
    manifest: PreparedOfflineProposalManifest,
    grant: PreparedOfflineSelectedGrant,
    request: JsonDocument,
    expectedContext: JsonDocument,
    maximumBytes: number,
  ) {
    this.#manifest = manifest;
    this.#grant = grant;
    this.#request = request;
    this.#expected = expectedContext;
    this.#maximumBytes = maximumBytes;
  }

  prepare(): RetainedInlineProposalExchange {
    positiveLimit(this.#maximumBytes);
    this.#grant.validateFor(this.#manifest);
    const manifestHash = this.#manifest.hash();
    const manifest = this.#manifest.document.parse() as Record<string, unknown>;
    const api = manifest.agent_api as Record<string, unknown>;
    const selection = closed(api.receipt_delivery, ['profile', 'action_ids']);
    if (
      selection.profile !== INLINE_RECEIPT_PROFILE ||
      !Array.isArray(selection.action_ids) ||
      selection.action_ids.length !== 1 ||
      selection.action_ids[0] !== this.#manifest.actionId
    )
      throw new Error('proposal_inline_selection_invalid');
    const parsed = new InlineMessage(
      this.#request,
      this.#maximumBytes,
    ).request();
    const ordinary = parsed.message.parse() as {
      payload: Record<string, unknown>;
    };
    const expected = this.#expected.parse(this.#maximumBytes) as Record<
      string,
      unknown
    >;
    const grantHash = this.#grant.hash();
    if (
      ordinary.payload.action_id !== this.#manifest.actionId ||
      ordinary.payload.surface_hash !== manifestHash ||
      ordinary.payload.grant_hash !== grantHash ||
      expected.grant_hash !== grantHash ||
      expected.surface_hash !== manifestHash ||
      expected.app_id !== manifest.app_id ||
      expected.surface_version !== manifest.surface_version
    )
      throw new Error('proposal_inline_binding_mismatch');
    const actionId = this.#manifest.actionId;
    const exchange = new OfflineProposalExchange(
      parsed.message,
      {
        validate: (document) =>
          this.#manifest.validateInput(actionId, document),
      },
      {
        validate: (document) =>
          this.#manifest.validateOutput(actionId, document),
      },
      this.#maximumBytes,
      this.#maximumBytes,
    ).prepare();
    new ProposalReceiptPair(
      '{}',
      JSON.stringify({ request: exchange.request().parse() }),
      this.#expected,
      parsed.receipt,
      new JsonDocument('{}'),
      this.#maximumBytes,
    ).checkRuntime();
    return Object.freeze(
      new RetainedInlineExchange(
        this.#request,
        this.#expected,
        parsed.receipt,
        exchange,
        this.#maximumBytes,
      ),
    );
  }
}

class RetainedInlineExchange implements RetainedInlineProposalExchange {
  readonly #request: JsonDocument;
  readonly #expected: JsonDocument;
  readonly #runtime: JsonDocument;
  readonly #exchange: RetainedProposalExchange;
  readonly #maximumBytes: number;

  constructor(
    request: JsonDocument,
    expected: JsonDocument,
    runtime: JsonDocument,
    exchange: RetainedProposalExchange,
    maximumBytes: number,
  ) {
    this.#request = request;
    this.#expected = expected;
    this.#runtime = runtime;
    this.#exchange = exchange;
    this.#maximumBytes = maximumBytes;
  }

  request(): JsonDocument {
    return new JsonDocument(
      JSON.stringify(this.#request.parse(this.#maximumBytes)),
    );
  }

  checkReceiptIntegrity(result: JsonDocument): ReceiptIntegrityChecked {
    const parsed = new InlineMessage(result, this.#maximumBytes).result();
    return this.#exchange
      .correlate(parsed.message)
      .checkReceiptIntegrity(
        this.#expected,
        this.#runtime,
        parsed.receipt,
        this.#maximumBytes,
      );
  }
}

class InlineMessage {
  readonly #document: JsonDocument;
  readonly #maximumBytes: number;

  constructor(document: JsonDocument, maximumBytes: number) {
    this.#document = document;
    this.#maximumBytes = maximumBytes;
  }

  request(): { message: JsonDocument; receipt: JsonDocument } {
    return this.#read('action.request', 'runtime_receipt');
  }

  result(): { message: JsonDocument; receipt: JsonDocument } {
    return this.#read('action.result', 'app_receipt');
  }

  #read(
    type: string,
    receiptField: string,
  ): { message: JsonDocument; receipt: JsonDocument } {
    const message = closed(this.#document.parse(this.#maximumBytes), [
      'type',
      'payload',
    ]);
    if (message.type !== type) throw new Error('proposal_message_unsupported');
    if (
      typeof message.payload !== 'object' ||
      message.payload === null ||
      Array.isArray(message.payload)
    )
      throw new Error('proposal_shape_invalid');
    const payload = { ...(message.payload as Record<string, unknown>) };
    const carrier = closed(payload[INLINE_RECEIPT_EXTENSION], [
      'profile',
      receiptField,
    ]);
    if (carrier.profile !== INLINE_RECEIPT_PROFILE)
      throw new Error('proposal_inline_profile_unsupported');
    const receipt = new JsonDocument(JSON.stringify(carrier[receiptField]));
    delete payload[INLINE_RECEIPT_EXTENSION];
    return {
      message: new JsonDocument(JSON.stringify({ type, payload })),
      receipt,
    };
  }
}
