import assert from 'node:assert/strict';
import test from 'node:test';
import { JsonDocument, SurfaceSnapshot } from '@0al/agent-surface';
import {
  INLINE_RECEIPT_EXTENSION as EXTENSION,
  OfflineInlineProposalExchange,
  INLINE_RECEIPT_PROFILE as PROFILE,
} from '@0al/offline-proposal-exchange-experiment';
import { json } from './fixtures.mjs';
import { receiptFixture, relink } from './receipt-fixtures.mjs';

// Synthetic, trusted host collaborators: no valid issuer/Grant/authentication
// is established by these fixtures. Public manifest/Grant validators have
// independent unit coverage; real-host composition remains an integration gate.
function fixture(kind = 'calcu') {
  const vector = receiptFixture(kind);
  const manifestValue = {
    app_id: vector.expected.app_id,
    surface_version: vector.expected.surface_version,
    agent_api: {
      receipt_delivery: {
        profile: PROFILE,
        action_ids: [vector.request.payload.action_id],
      },
    },
  };
  const surface = new SurfaceSnapshot(json(manifestValue)).hash();
  for (const value of [
    vector.request.payload,
    vector.response.payload,
    vector.expected,
    vector.runtimeReceipt,
    vector.applicationReceipt,
  ])
    value.surface_hash = surface;
  relink(vector);
  vector.request.payload[EXTENSION] = {
    profile: PROFILE,
    runtime_receipt: vector.runtimeReceipt,
  };
  vector.response.payload[EXTENSION] = {
    profile: PROFILE,
    app_receipt: vector.applicationReceipt,
  };
  let grantChecks = 0;
  return {
    ...vector,
    manifestValue,
    manifest: {
      document: json(manifestValue),
      actionId: vector.request.payload.action_id,
      hash: () => surface,
      validateInput: (_action, document) =>
        vector.inputSchema.validate(document),
      validateOutput: (_action, document) =>
        vector.outputSchema.validate(document),
    },
    grant: {
      validate: () => {
        grantChecks += 1;
      },
      hash: () => vector.expected.grant_hash,
    },
    grantChecks: () => grantChecks,
  };
}

function prepare(value, request = json(value.request), limit = 16384) {
  return new OfflineInlineProposalExchange(
    value.manifest,
    value.grant,
    request,
    json(value.expected),
    limit,
  ).prepare();
}

for (const kind of ['calcu', 'hello']) {
  test(`${kind}: inline pair integrity, not authenticated acceptance`, () => {
    const value = fixture(kind);
    const before = JSON.stringify(value.request);
    const retained = prepare(value);
    assert.equal(value.grantChecks(), 1);
    assert.deepEqual(retained.request().parse(), value.request);
    const checked = retained.checkReceiptIntegrity(json(value.response));
    assert.deepEqual(checked.unverifiedOutput().parse(), value.output);
    assert.equal(checked.status, 'integrity_checked');
    assert.equal(checked.assurance.producer_authentication, 'not_verified');
    assert.equal(checked.assurance.current_authority, 'not_verified');
    assert.equal(JSON.stringify(value.request), before);
    const leaked = retained.request().parse();
    leaked.payload[EXTENSION].runtime_receipt.receipt_type = 'app';
    value.request.payload.input = { fabricated: true };
    assert.equal(
      retained.request().parse().payload[EXTENSION].runtime_receipt
        .receipt_type,
      'runtime',
    );
    assert.deepEqual(
      retained
        .checkReceiptIntegrity(json(value.response))
        .unverifiedOutput()
        .parse(),
      value.output,
    );
  });
}

for (const [name, mutate] of [
  [
    'missing extension',
    (v) => {
      delete v.request.payload[EXTENSION];
    },
  ],
  [
    'profile swap',
    (v) => {
      v.request.payload[EXTENSION].profile = 'unknown';
    },
  ],
  [
    'unknown member',
    (v) => {
      v.request.payload[EXTENSION].extra = true;
    },
  ],
  [
    'approval unsupported',
    (v) => {
      v.request.payload[EXTENSION].approval_receipts = {};
    },
  ],
  [
    'null receipt',
    (v) => {
      v.request.payload[EXTENSION].runtime_receipt = null;
    },
  ],
  [
    'bare hash',
    (v) => {
      v.request.payload[EXTENSION].runtime_receipt =
        v.runtimeReceipt.receipt_hash;
    },
  ],
  [
    'wrong role',
    (v) => {
      v.runtimeReceipt.receipt_type = 'app';
    },
  ],
  [
    'partial receipt',
    (v) => {
      delete v.runtimeReceipt.policy_decision;
    },
  ],
  [
    'parent mismatch',
    (v) => {
      v.request.payload.parent_receipt_hash = v.expected.surface_hash;
    },
  ],
  [
    'raw legacy member',
    (v) => {
      v.request.payload.runtime_receipt = v.runtimeReceipt;
    },
  ],
  [
    'unknown action',
    (v) => {
      v.request.payload.action_id = 'other';
    },
  ],
  [
    'stale generation',
    (v) => {
      v.request.payload.session_generation += 1;
    },
  ],
]) {
  test(`request rejects ${name}`, () => {
    const value = fixture();
    mutate(value);
    assert.throws(() => prepare(value));
  });
}

for (const [name, mutate] of [
  [
    'missing extension',
    (v) => {
      delete v.response.payload[EXTENSION];
    },
  ],
  [
    'profile swap',
    (v) => {
      v.response.payload[EXTENSION].profile = 'unknown';
    },
  ],
  [
    'unknown member',
    (v) => {
      v.response.payload[EXTENSION].credential = 'forbidden';
    },
  ],
  [
    'approval unsupported',
    (v) => {
      v.response.payload[EXTENSION].approval_receipts = {};
    },
  ],
  [
    'null receipt',
    (v) => {
      v.response.payload[EXTENSION].app_receipt = null;
    },
  ],
  [
    'URL substitute',
    (v) => {
      v.response.payload[EXTENSION].app_receipt =
        'https://example.test/receipt';
    },
  ],
  [
    'partial App Receipt',
    (v) => {
      delete v.applicationReceipt.policy_decision;
    },
  ],
  [
    'role swap',
    (v) => {
      v.applicationReceipt.receipt_type = 'runtime';
    },
  ],
  [
    'receipt mismatch',
    (v) => {
      v.response.payload.receipt_id = 'other';
    },
  ],
  [
    'tuple mismatch',
    (v) => {
      v.applicationReceipt.subject.user = 'other';
      relink(v);
    },
  ],
  [
    'output mismatch',
    (v) => {
      v.applicationReceipt.output_hash = v.expected.surface_hash;
      relink(v);
    },
  ],
  [
    'raw legacy member',
    (v) => {
      v.response.payload.receipt = v.applicationReceipt;
    },
  ],
  [
    'signatures unsupported',
    (v) => {
      v.applicationReceipt.receipt_signatures = {};
    },
  ],
]) {
  test(`response rejects ${name}`, () => {
    const value = fixture();
    const retained = prepare(value);
    mutate(value);
    assert.throws(() => retained.checkReceiptIntegrity(json(value.response)));
  });
}

test('undeclared profile, wrong selected Grant hash and validation denial fail closed', () => {
  const value = fixture();
  const original = value.manifest;
  value.manifest = {
    ...original,
    document: json({ ...value.manifestValue, agent_api: {} }),
  };
  assert.throws(() => prepare(value));
  value.manifest = original;
  value.grant = { validate: () => {}, hash: () => value.expected.surface_hash };
  assert.throws(() => prepare(value));
  value.grant = {
    validate: () => {
      throw new Error('grant_denied');
    },
    hash: () => value.expected.grant_hash,
  };
  assert.throws(() => prepare(value), /grant_denied/);
});

test('whole-body limits and duplicate URI members are checked before extraction', () => {
  const value = fixture();
  assert.throws(() => prepare(value, json(value.request), 128));
  const retained = prepare(value);
  const huge = structuredClone(value.response);
  huge.payload[EXTENSION].app_receipt.padding = 'x'.repeat(16384);
  assert.throws(
    () => retained.checkReceiptIntegrity(json(huge)),
    /json_byte_limit/,
  );
  const source = JSON.stringify(value.request).replace(
    `"${EXTENSION}":`,
    `"${EXTENSION}":{},"${EXTENSION}":`,
  );
  assert.throws(() => prepare(value, new JsonDocument(source)));
});
