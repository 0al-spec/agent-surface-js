import type { JsonDocument, PreparedSchema } from '@0al/agent-surface';
import {
  OfflineProposalExchange,
  type PendingProposalEvidence,
  type ReceiptIntegrityChecked,
} from '@0al/offline-proposal-exchange-experiment';

// Compile-only boundary example. Real schemas come from OfflineSchemaResources.
declare const input: PreparedSchema;
declare const output: PreparedSchema;
declare const sourceRequest: JsonDocument;
declare const sourceResult: JsonDocument;
const exchange = new OfflineProposalExchange(
  sourceRequest,
  input,
  output,
  8192,
  8192,
).prepare();
const pending: PendingProposalEvidence = exchange.correlate(sourceResult);
const state: 'evidence_required' = pending.status;
const unverified: JsonDocument = pending.unverifiedOutput();
void state;
void unverified;
declare const expectedContext: JsonDocument;
declare const runtimeReceipt: JsonDocument;
declare const appReceipt: JsonDocument;
const checked: ReceiptIntegrityChecked = pending.checkReceiptIntegrity(
  expectedContext,
  runtimeReceipt,
  appReceipt,
  8192,
);
const integrity: 'integrity_checked' = checked.status;
const authentication: 'not_verified' =
  checked.assurance.producer_authentication;
void integrity;
void authentication;
// @ts-expect-error Receipt integrity does not expose accepted execution.
checked.acceptedOutput();
// @ts-expect-error No verified success, execution or receipt-verification shortcut.
pending.verified;
// @ts-expect-error No application dispatcher.
exchange.execute();

// @ts-expect-error Not a base SDK export.
import { OfflineProposalExchange as PublicExchange } from '@0al/agent-surface';

void PublicExchange;
