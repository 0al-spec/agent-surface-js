import assert from 'node:assert/strict';
import * as publicSdk from '@0al/agent-surface';
import { OfflineProposalExchange } from '@0al/offline-proposal-exchange-experiment';
import { fixture, json } from './fixtures.mjs';
import { receiptFixture } from './receipt-fixtures.mjs';

for (const kind of ['calcu', 'greeting']) {
  const vector = fixture(kind);
  const exchange = new OfflineProposalExchange(
    json(vector.request),
    vector.inputSchema,
    vector.outputSchema,
    8192,
    8192,
  ).prepare();
  const pending = exchange.correlate(json(vector.response));
  assert.equal(pending.status, 'evidence_required');
  assert.deepEqual(pending.unverifiedOutput().parse(), vector.output);
  assert.equal('verified' in pending, false);
  assert.equal('execute' in exchange, false);
  const forged = structuredClone(vector.response);
  forged.payload.session_id = 'another-request';
  assert.throws(
    () => exchange.correlate(json(forged)),
    /proposal_correlation_mismatch/,
  );
  const receiptVector = receiptFixture(kind);
  const receiptPending = new OfflineProposalExchange(
    json(receiptVector.request),
    receiptVector.inputSchema,
    receiptVector.outputSchema,
    8192,
    8192,
  )
    .prepare()
    .correlate(json(receiptVector.response));
  const checked = receiptPending.checkReceiptIntegrity(
    json(receiptVector.expected),
    json(receiptVector.runtimeReceipt),
    json(receiptVector.applicationReceipt),
    8192,
  );
  assert.equal(checked.status, 'integrity_checked');
  assert.equal(checked.assurance.producer_authentication, 'not_verified');
  assert.deepEqual(checked.unverifiedOutput().parse(), receiptVector.output);
}
assert.equal('OfflineProposalExchange' in publicSdk, false);
await assert.rejects(import('@0al/agent-surface/proposal-exchange'), {
  code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
});
await assert.rejects(
  import('@0al/offline-proposal-exchange-experiment/dist/wire.js'),
  { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' },
);
await assert.rejects(
  import('@0al/offline-proposal-exchange-experiment/dist/receipt-pair.js'),
  { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' },
);
console.log(
  'Packed Calcu/Greeting offline values: evidence still required; no public export or dispatcher',
);
