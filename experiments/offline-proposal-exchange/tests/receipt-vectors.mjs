import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { JsonDocument } from '@0al/agent-surface';
import { OfflineProposalExchange } from '@0al/offline-proposal-exchange-experiment';
import { json, OTHER_HASH } from './fixtures.mjs';
import { receiptFixture, rehashReceipt, relink } from './receipt-fixtures.mjs';

function pending(vector) {
  return new OfflineProposalExchange(
    json(vector.request),
    vector.inputSchema,
    vector.outputSchema,
    8192,
    8192,
  )
    .prepare()
    .correlate(json(vector.response));
}
function check(
  vector,
  expected = json(vector.expected),
  runtime = json(vector.runtimeReceipt),
  app = json(vector.applicationReceipt),
  limit = 8192,
) {
  return pending(vector).checkReceiptIntegrity(expected, runtime, app, limit);
}
function mutated(role, change, synchronize = true) {
  const vector = receiptFixture();
  change(
    role === 'runtime' ? vector.runtimeReceipt : vector.applicationReceipt,
    vector,
  );
  if (synchronize) relink(vector);
  return vector;
}

for (const kind of ['calcu', 'greeting']) {
  test(`${kind}: complete unsigned selected pair passes integrity with explicit assurance`, () => {
    const vector = receiptFixture(kind);
    const candidate = pending(vector);
    const checked = candidate.checkReceiptIntegrity(
      json(vector.expected),
      json(vector.runtimeReceipt),
      json(vector.applicationReceipt),
      8192,
    );
    assert.equal(candidate.status, 'evidence_required');
    assert.equal(checked.status, 'integrity_checked');
    assert.deepEqual(checked.assurance, {
      receipt_integrity: 'checked',
      producer_authentication: 'not_verified',
      current_authority: 'not_verified',
      trusted_time: 'not_verified',
      application_acceptance: 'not_verified',
    });
    assert.deepEqual(checked.unverifiedOutput().parse(), vector.output);
    assert.deepEqual(checked.receipts().parse(), {
      runtime: vector.runtimeReceipt,
      app: vector.applicationReceipt,
    });
    assert.equal('verified' in checked, false);
    assert.equal('acceptedOutput' in checked, false);
    assert.ok(Object.isFrozen(checked));
    assert.ok(Object.isFrozen(checked.assurance));
  });
}

test('independent ASCII hash oracle checks complete receipt and policy views', () => {
  const vector = receiptFixture();
  // These fixture values use only well-formed JSON and ASCII member names.
  const ordered = (value) =>
    Array.isArray(value)
      ? `[${value.map(ordered).join(',')}]`
      : value !== null && typeof value === 'object'
        ? `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${ordered(value[key])}`)
            .join(',')}}`
        : JSON.stringify(value);
  const digest = (kind, object) =>
    `sha-256:${createHash('sha256')
      .update(
        ordered({
          domain: `https://github.com/0al-spec/agent-surface/hash/${kind}/v1`,
          object,
        }),
      )
      .digest('base64url')}`;
  for (const receipt of [vector.runtimeReceipt, vector.applicationReceipt]) {
    const policy = { ...receipt.policy_decision };
    delete policy.policy_decision_hash;
    const view = { ...receipt };
    delete view.receipt_hash;
    assert.equal(
      receipt.policy_decision_hash,
      digest('policy-decision', policy),
    );
    assert.equal(receipt.receipt_hash, digest('receipt', view));
  }
  check(vector);
});

for (const role of ['runtime', 'app']) {
  const vector = receiptFixture();
  const receipt =
    role === 'runtime' ? vector.runtimeReceipt : vector.applicationReceipt;
  for (const field of Object.keys(receipt)) {
    test(`${role}: missing complete field ${field}`, () => {
      const vector = mutated(
        role,
        (receipt) => {
          delete receipt[field];
        },
        false,
      );
      assert.throws(() => check(vector));
    });
    test(`${role}: null complete field ${field}`, () => {
      const vector = mutated(
        role,
        (receipt) => {
          receipt[field] = null;
        },
        false,
      );
      assert.throws(() => check(vector));
    });
  }
  for (const field of [
    'credential',
    'grant',
    'output',
    'input',
    'execution_token',
    'receipt_url',
    'receiptVerified',
    'extensions',
    'approval_receipt_hashes',
    'budget_charges',
    'linked_trace_id',
    'actual_effects',
  ]) {
    test(`${role}: unsupported member ${field}, even with recomputed hash`, () => {
      assert.throws(
        () =>
          check(
            mutated(role, (receipt) => {
              receipt[field] = 'TEST_PRIVATE_CONTENT';
            }),
          ),
        /proposal_shape_invalid/,
      );
    });
  }
  for (const signatures of [
    null,
    { signatures: [] },
    { signatures: [{ alg: 'none' }] },
  ])
    test(`${role}: signed content cannot fall back to unsigned checks ${JSON.stringify(signatures)}`, () => {
      const vector = mutated(role, (receipt) => {
        receipt.receipt_signatures = signatures;
      });
      assert.throws(
        () => check(vector),
        /proposal_receipt_signing_unsupported/,
      );
    });
  for (const [field, value] of Object.entries({
    session_id: 'other-session',
    session_generation: 2,
    grant_id: 'other-grant',
    grant_hash: OTHER_HASH,
    surface_hash: OTHER_HASH,
    action_id: 'other.propose',
    idempotency_key: 'other-key',
    trace_id: 'a'.repeat(32),
    input_hash: OTHER_HASH,
    execution_hash: OTHER_HASH,
    app_id: 'other.app',
    surface_version: 'v2',
  }))
    test(`${role}: rebound ${field}, with both receipt hashes recomputed`, () => {
      assert.throws(
        () =>
          check(
            mutated(role, (receipt) => {
              receipt[field] = value;
            }),
          ),
        /proposal_receipt_binding_mismatch/,
      );
    });
  for (const [name, change] of [
    [
      'runtime ID',
      (receipt) => {
        receipt.runtime.runtime_id = 'other-runtime';
      },
    ],
    [
      'agent ID',
      (receipt) => {
        receipt.actor_agent.agent_id = 'other-agent';
      },
    ],
    [
      'identity commitment',
      (receipt) => {
        receipt.actor_agent.identity_evidence_hash = OTHER_HASH;
      },
    ],
    [
      'user',
      (receipt) => {
        receipt.subject.user = 'other-user';
      },
    ],
    [
      'execution ID',
      (receipt) => {
        receipt.execution.execution_id = 'other-execution';
      },
    ],
    [
      'mode',
      (receipt) => {
        receipt.execution.mode = 'commit';
      },
    ],
    [
      'span',
      (receipt) => {
        receipt.span_id = 'a'.repeat(16);
      },
    ],
  ])
    test(`${role}: substituted ${name}, with valid hashes`, () => {
      assert.throws(
        () => check(mutated(role, change)),
        /proposal_receipt_binding_mismatch/,
      );
    });
  test(`${role}: wrong producer role`, () =>
    assert.throws(
      () =>
        check(
          mutated(role, (receipt) => {
            receipt.receipt_type = role === 'runtime' ? 'app' : 'runtime';
          }),
        ),
      /proposal_receipt_role_invalid/,
    ));
  test(`${role}: wrong producer result`, () =>
    assert.throws(
      () =>
        check(
          mutated(role, (receipt) => {
            receipt.result =
              role === 'runtime' ? 'success' : 'authorized_for_forwarding';
          }),
        ),
      /proposal_receipt_role_invalid/,
    ));
  test(`${role}: broken receipt hash`, () =>
    assert.throws(
      () =>
        check(
          mutated(
            role,
            (receipt) => {
              receipt.receipt_hash = OTHER_HASH;
            },
            false,
          ),
        ),
      /proposal_receipt_binding_mismatch/,
    ));
  test(`${role}: policy text tampering without recomputing hashes`, () =>
    assert.throws(
      () =>
        check(
          mutated(
            role,
            (receipt) => {
              receipt.policy_decision.safe_to_show += ' changed';
            },
            false,
          ),
        ),
      /proposal_receipt_binding_mismatch/,
    ));
  test(`${role}: noncanonical digest rejected`, () =>
    assert.throws(
      () =>
        check(
          mutated(
            role,
            (receipt) => {
              receipt.receipt_hash = `sha-256:${'A'.repeat(42)}B`;
            },
            false,
          ),
        ),
      /proposal_digest_invalid/,
    ));

  for (const field of Object.keys(receipt.policy_decision)) {
    test(`${role}: missing policy field ${field}`, () =>
      assert.throws(() =>
        check(
          mutated(
            role,
            (receipt) => {
              delete receipt.policy_decision[field];
            },
            false,
          ),
        ),
      ));
    test(`${role}: null policy field ${field}`, () =>
      assert.throws(() =>
        check(
          mutated(
            role,
            (receipt) => {
              receipt.policy_decision[field] = null;
            },
            false,
          ),
        ),
      ));
  }
  for (const [name, change] of [
    [
      'wrong enforcer',
      (decision) => {
        decision.enforcer.id = 'other-enforcer';
      },
    ],
    [
      'wrong enforcer role',
      (decision) => {
        decision.enforcer.type = 'enterprise';
      },
    ],
    [
      'wrong policy ID',
      (decision) => {
        decision.policy.id = 'other-policy';
      },
    ],
    [
      'wrong policy version',
      (decision) => {
        decision.policy.version = 'other-version';
      },
    ],
    [
      'deny',
      (decision) => {
        decision.outcome = 'deny';
      },
    ],
    [
      'require approval',
      (decision) => {
        decision.outcome = 'require_approval';
      },
    ],
    [
      'denial reason under allow',
      (decision) => {
        decision.reason_code = 'scope_denied';
      },
    ],
    [
      'unselected approval reason',
      (decision) => {
        decision.reason_code = 'approval_satisfied';
      },
    ],
    [
      'bare custom reason',
      (decision) => {
        decision.reason_code = 'local_forwarding_policy_allowed';
      },
    ],
    [
      'unselected extension URI',
      (decision) => {
        decision.reason_code = 'https://example.test/reason/allow';
      },
    ],
    [
      'duplicate rules',
      (decision) => {
        decision.matched_rules = ['rule', 'rule'];
      },
    ],
    [
      'excess rules',
      (decision) => {
        decision.matched_rules = Array.from(
          { length: 65 },
          (_, i) => `rule-${i}`,
        );
      },
    ],
    [
      'empty rule ID',
      (decision) => {
        decision.matched_rules = [''];
      },
    ],
    [
      'excess safe text',
      (decision) => {
        decision.safe_to_show = 'x'.repeat(4097);
      },
    ],
    [
      'empty safe text',
      (decision) => {
        decision.safe_to_show = '';
      },
    ],
    [
      'future decision relative to receipt',
      (decision) => {
        decision.evaluated_at = '2026-10-03T06:30:00.123456790Z';
      },
    ],
    [
      'extra decision field',
      (decision) => {
        decision.credential = 'TEST_PRIVATE_CONTENT';
      },
    ],
  ])
    test(`${role}: ${name} with recomputed policy/receipt hashes`, () =>
      assert.throws(() =>
        check(mutated(role, (receipt) => change(receipt.policy_decision))),
      ));

  for (const timestamp of [
    '2026-02-29T00:00:00Z',
    '2026-04-31T00:00:00Z',
    '2026-00-01T00:00:00Z',
    '2026-01-00T00:00:00Z',
    '2026-13-01T00:00:00Z',
    '2026-10-03T24:00:00Z',
    '2026-10-03T00:60:00Z',
    '2026-10-03T00:00:60Z',
    '2026-10-03T00:00:00+00:00',
    '2026-10-03T00:00:00.1234567890Z',
    'invalid',
  ])
    test(`${role}: invalid selected UTC timestamp ${timestamp}`, () =>
      assert.throws(
        () =>
          check(
            mutated(role, (receipt) => {
              receipt.timestamp = timestamp;
              receipt.policy_decision.evaluated_at = timestamp;
            }),
          ),
        /proposal_receipt_timestamp_invalid/,
      ));
}

test('runtime root omits parent and output, including explicit null', () => {
  for (const field of ['parent_receipt_hash', 'output_hash'])
    for (const value of [null, OTHER_HASH])
      assert.throws(
        () =>
          check(
            mutated('runtime', (receipt) => {
              receipt[field] = value;
            }),
          ),
        /proposal_shape_invalid/,
      );
});
test('missing parent content cannot be replaced by its correct hash', () => {
  const vector = receiptFixture();
  assert.throws(
    () =>
      check(
        vector,
        json(vector.expected),
        json({ receipt_hash: vector.runtimeReceipt.receipt_hash }),
      ),
    /proposal_shape_invalid/,
  );
  assert.throws(
    () =>
      check(
        vector,
        json(vector.expected),
        undefined,
        json({ receipt_hash: vector.applicationReceipt.receipt_hash }),
      ),
    /proposal_shape_invalid/,
  );
});
test('foreign app receipt reference is not accepted', () => {
  const vector = receiptFixture();
  vector.response.payload.receipt_id = 'foreign';
  assert.throws(() => check(vector), /proposal_receipt_binding_mismatch/);
  vector.response.payload.receipt_id = vector.applicationReceipt.receipt_id;
  vector.response.payload.receipt_hash = OTHER_HASH;
  assert.throws(() => check(vector), /proposal_receipt_binding_mismatch/);
});
test('wrong parent and output rejected after recomputing app hash', () => {
  for (const field of ['parent_receipt_hash', 'output_hash']) {
    const vector = receiptFixture();
    vector.applicationReceipt[field] = OTHER_HASH;
    rehashReceipt(vector.applicationReceipt);
    vector.response.payload.receipt_hash =
      vector.applicationReceipt.receipt_hash;
    assert.throws(() => check(vector), /proposal_receipt_binding_mismatch/);
  }
});
test('receipt ID conflict between root and child rejected', () => {
  const vector = mutated('app', (receipt, vector) => {
    receipt.receipt_id = vector.runtimeReceipt.receipt_id;
  });
  assert.throws(() => check(vector), /proposal_receipt_identity_conflict/);
});
test('cyclic/self-linked app parent rejected', () => {
  const vector = receiptFixture();
  vector.applicationReceipt.parent_receipt_hash =
    vector.applicationReceipt.receipt_hash;
  rehashReceipt(vector.applicationReceipt);
  vector.response.payload.receipt_hash = vector.applicationReceipt.receipt_hash;
  assert.throws(() => check(vector), /proposal_receipt_binding_mismatch/);
});
test('top-level policy hash must equal complete embedded decision hash', () => {
  const vector = receiptFixture();
  vector.applicationReceipt.policy_decision_hash = OTHER_HASH;
  const view = { ...vector.applicationReceipt };
  delete view.receipt_hash;
  // Recompute receipt only, deliberately retaining the mismatched policy echo.
  const sorted = (value) =>
    Array.isArray(value)
      ? value.map(sorted)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, sorted(value[key])]),
          )
        : value;
  vector.applicationReceipt.receipt_hash = `sha-256:${createHash('sha256')
    .update(
      JSON.stringify(
        sorted({
          domain: 'https://github.com/0al-spec/agent-surface/hash/receipt/v1',
          object: view,
        }),
      ),
    )
    .digest('base64url')}`;
  vector.response.payload.receipt_hash = vector.applicationReceipt.receipt_hash;
  assert.throws(() => check(vector), /proposal_receipt_binding_mismatch/);
});

for (const field of Object.keys(receiptFixture().expected)) {
  test(`independent host context: missing ${field}`, () => {
    const vector = receiptFixture();
    delete vector.expected[field];
    assert.throws(() => check(vector), /proposal_shape_invalid/);
  });
  test(`independent host context: null ${field}`, () => {
    const vector = receiptFixture();
    vector.expected[field] = null;
    assert.throws(() => check(vector));
  });
}
test('wrong host context cannot be inferred from otherwise consistent receipts', () => {
  const fields = [
    'session_id',
    'grant_id',
    'action_id',
    'app_id',
    'surface_version',
    'idempotency_key',
  ];
  for (const field of fields) {
    const vector = receiptFixture();
    vector.expected[field] = 'other';
    assert.throws(() => check(vector), /proposal_receipt_binding_mismatch/);
  }
  const vector = receiptFixture();
  vector.expected.actor_agent.agent_id = 'other-agent';
  assert.throws(() => check(vector), /proposal_receipt_binding_mismatch/);
  vector.expected.actor_agent.agent_id = 'calcu.agent';
  vector.expected.policies.application.version = 'different';
  assert.throws(() => check(vector), /proposal_receipt_binding_mismatch/);
});
test('independent context forbids verification flags and unselected authority fields', () => {
  for (const field of [
    'receiptVerified',
    'credential',
    'audience',
    'identityArtifact',
  ]) {
    const vector = receiptFixture();
    vector.expected[field] = true;
    assert.throws(() => check(vector), /proposal_shape_invalid/);
  }
});
test('nested tuple, enforcer and policy shapes are closed', () => {
  for (const [target, field] of [
    ['runtime', 'runtime_id'],
    ['actor_agent', 'agent_id'],
    ['actor_agent', 'identity_evidence_hash'],
    ['subject', 'user'],
    ['execution', 'mode'],
    ['execution', 'execution_id'],
  ]) {
    const vector = mutated('app', (receipt) => {
      delete receipt[target][field];
    });
    assert.throws(() => check(vector), /proposal_shape_invalid/);
  }
  for (const target of ['enforcer', 'policy']) {
    const vector = mutated('app', (receipt) => {
      receipt.policy_decision[target].extra = 'unselected';
    });
    assert.throws(() => check(vector), /proposal_shape_invalid/);
  }
});

for (const limit of [
  0,
  -1,
  0.5,
  Number.MAX_SAFE_INTEGER + 1,
  NaN,
  Infinity,
  '8192',
  undefined,
])
  test(`receipt cap must be explicit positive safe integer: ${String(limit)}`, () => {
    const vector = receiptFixture();
    assert.throws(
      () =>
        pending(vector).checkReceiptIntegrity(
          json(vector.expected),
          json(vector.runtimeReceipt),
          json(vector.applicationReceipt),
          limit,
        ),
      /proposal_byte_limit_invalid/,
    );
  });
test('each original receipt and context is byte-bounded before parsing', () => {
  const vector = receiptFixture();
  vector.runtimeReceipt.policy_decision.safe_to_show = 'ë'.repeat(1000);
  relink(vector);
  const documents = [
    json(vector.expected),
    json(vector.runtimeReceipt),
    json(vector.applicationReceipt),
  ];
  const maximum = Math.max(
    ...documents.map((document) => document.utf8ByteLength()),
  );
  assert.equal(
    check(vector, ...documents, maximum).status,
    'integrity_checked',
  );
  assert.throws(
    () => check(vector, ...documents, maximum - 1),
    /json_byte_limit/,
  );
  assert.throws(
    () =>
      check(
        vector,
        new JsonDocument(' '.repeat(8192) + JSON.stringify(vector.expected)),
      ),
    /json_byte_limit/,
  );
});
test('missing complete receipt documents are rejected', () => {
  const vector = receiptFixture();
  for (const missing of [undefined, null, {}, 'hash-only']) {
    assert.throws(
      () =>
        pending(vector).checkReceiptIntegrity(
          json(vector.expected),
          missing,
          json(vector.applicationReceipt),
          8192,
        ),
      /proposal_document_invalid/,
    );
    assert.throws(
      () =>
        pending(vector).checkReceiptIntegrity(
          json(vector.expected),
          json(vector.runtimeReceipt),
          missing,
          8192,
        ),
      /proposal_document_invalid/,
    );
  }
});
test('strict original receipt parsing retains duplicates, invalid numbers and Unicode', () => {
  const vector = receiptFixture();
  for (const [transform, diagnostic] of [
    [
      (text) =>
        text.replace('"receipt_id":', '"receipt_id":"foreign","receipt_id":'),
      /duplicate_json_member/,
    ],
    [
      (text) =>
        text.replace(
          '"safe_to_show":',
          '"safe_to_show":"hidden","safe_to_show":',
        ),
      /duplicate_json_member/,
    ],
    [
      (text) =>
        text.replace('"session_generation":1', '"session_generation":-0'),
      /invalid_json_number/,
    ],
    [
      (text) =>
        text.replace('"session_generation":1', '"session_generation":1e400'),
      /invalid_json_number/,
    ],
    [(text) => text.replace('calcu.user', '\\ud800'), /invalid_unicode/],
    [(text) => text.slice(0, -1), /invalid_json/],
  ]) {
    assert.throws(
      () =>
        check(
          vector,
          json(vector.expected),
          new JsonDocument(transform(JSON.stringify(vector.runtimeReceipt))),
        ),
      diagnostic,
    );
    assert.throws(
      () =>
        check(
          vector,
          json(vector.expected),
          json(vector.runtimeReceipt),
          new JsonDocument(
            transform(JSON.stringify(vector.applicationReceipt)),
          ),
        ),
      diagnostic,
    );
  }
  assert.throws(
    () =>
      check(
        vector,
        json(vector.expected),
        new JsonDocument(`${'['.repeat(257)}0${']'.repeat(257)}`),
      ),
    /json_nesting_limit/,
  );
});
test('receipts and context retain JSON value semantics despite insertion order', () => {
  const vector = receiptFixture('greeting');
  const reordered = (value) =>
    Array.isArray(value)
      ? value.map(reordered)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .reverse()
              .map(([key, child]) => [key, reordered(child)]),
          )
        : value;
  const result = check(
    vector,
    json(reordered(vector.expected)),
    json(reordered(vector.runtimeReceipt)),
    json(reordered(vector.applicationReceipt)),
  );
  assert.equal(result.status, 'integrity_checked');
});
test('returned snapshots and caller mutations cannot change checked evidence', () => {
  const vector = receiptFixture();
  const context = json(vector.expected);
  const runtime = json(vector.runtimeReceipt);
  const app = json(vector.applicationReceipt);
  const candidate = pending(vector);
  vector.expected.actor_agent.agent_id = 'mutated';
  runtime.parse().subject.user = 'mutated';
  app.parse().policy_decision.matched_rules.reverse();
  const result = candidate.checkReceiptIntegrity(context, runtime, app, 8192);
  result.receipts().parse().app.actor_agent.agent_id = 'mutated';
  result.unverifiedOutput().parse().result = 999;
  assert.equal(
    result.receipts().parse().app.actor_agent.agent_id,
    'calcu.agent',
  );
  assert.equal(result.unverifiedOutput().parse().result, 36);
});
test('rule ordering and Unicode remain part of receipt/policy hashes', () => {
  const vector = receiptFixture();
  vector.applicationReceipt.policy_decision.matched_rules.reverse();
  assert.throws(() => check(vector), /proposal_receipt_binding_mismatch/);
  relink(vector);
  assert.equal(check(vector).status, 'integrity_checked');
  vector.applicationReceipt.policy_decision.safe_to_show = 'Zoë';
  relink(vector);
  check(vector);
  vector.applicationReceipt.policy_decision.safe_to_show = 'Zoe\u0308';
  assert.throws(() => check(vector), /proposal_receipt_binding_mismatch/);
});
test('valid UTC calendar fractions and empty rule lists accepted without trusted-time claim', () => {
  for (const time of [
    '2000-02-29T23:59:59Z',
    '2024-02-29T00:00:00.1Z',
    '2026-10-03T06:30:00.123456789Z',
    '2099-01-01T00:00:00Z',
  ]) {
    const vector = receiptFixture();
    for (const receipt of [vector.runtimeReceipt, vector.applicationReceipt]) {
      receipt.timestamp = time;
      receipt.policy_decision.evaluated_at = time;
      receipt.policy_decision.matched_rules = [];
    }
    relink(vector);
    assert.equal(check(vector).assurance.trusted_time, 'not_verified');
  }
});
test('a fully rehashed fabricated result still has no producer or domain assurance', () => {
  const vector = receiptFixture();
  vector.response.payload.output.result = 999;
  // Derive only the syntactic output commitment from the correlated candidate.
  vector.applicationReceipt.output_hash = pending(vector)
    .evidenceInputs()
    .parse().output_hash;
  relink(vector);
  const result = check(vector);
  assert.equal(result.unverifiedOutput().parse().result, 999);
  assert.equal(result.assurance.producer_authentication, 'not_verified');
  assert.equal(result.assurance.application_acceptance, 'not_verified');
});
test('fixed rejection diagnostics never echo receipt content or perform network I/O', (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', () => {
    throw new Error('unexpected_fetch');
  });
  const log = t.mock.method(console, 'log', () => {
    throw new Error('unexpected_log');
  });
  const vector = mutated('app', (receipt) => {
    receipt.subject.user = 'TEST_PRIVATE_CONTENT';
  });
  assert.throws(() => check(vector), {
    message: 'proposal_receipt_binding_mismatch',
  });
  check(receiptFixture());
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(log.mock.callCount(), 0);
});
