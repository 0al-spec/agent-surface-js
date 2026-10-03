import { fixture, hash } from './fixtures.mjs';

export function rehashReceipt(receipt) {
  const decision = { ...receipt.policy_decision };
  delete decision.policy_decision_hash;
  receipt.policy_decision.policy_decision_hash = hash(
    'policy-decision',
    decision,
  );
  receipt.policy_decision_hash = receipt.policy_decision.policy_decision_hash;
  const view = { ...receipt };
  delete view.receipt_hash;
  delete view.receipt_signatures;
  receipt.receipt_hash = hash('receipt', view);
}

/** Test manipulation only; keep wire refs synchronized to exercise deeper checks. */
export function relink(vector) {
  rehashReceipt(vector.runtimeReceipt);
  vector.request.payload.parent_receipt_hash =
    vector.runtimeReceipt.receipt_hash;
  if (Object.hasOwn(vector.applicationReceipt, 'parent_receipt_hash'))
    vector.applicationReceipt.parent_receipt_hash =
      vector.runtimeReceipt.receipt_hash;
  rehashReceipt(vector.applicationReceipt);
  vector.response.payload.receipt_hash = vector.applicationReceipt.receipt_hash;
  vector.response.payload.receipt_id = vector.applicationReceipt.receipt_id;
  return vector;
}

export function receiptFixture(kind = 'calcu') {
  const vector = fixture(kind);
  const request = vector.request.payload;
  // Host expectations are selected before producing any receipts.
  const expected = {
    session_id: request.session_id,
    session_generation: request.session_generation,
    grant_id: request.grant_id,
    grant_hash: request.grant_hash,
    surface_hash: request.surface_hash,
    action_id: request.action_id,
    idempotency_key: request.idempotency_key,
    trace_id: request.trace_id,
    span_id: request.span_id,
    input_hash: request.input_hash,
    execution: structuredClone(request.execution),
    execution_hash: request.execution_hash,
    app_id: `${kind}.app`,
    surface_version: 'surface-v1',
    runtime: { runtime_id: `${kind}.runtime` },
    actor_agent: {
      agent_id: `${kind}.agent`,
      identity_evidence_hash: request.grant_hash,
    },
    subject: { user: `${kind}.user` },
    policies: {
      runtime: { id: `${kind}-forwarding`, version: '1' },
      application: { id: `${kind}-admission`, version: '2' },
    },
  };
  const shared = structuredClone(expected);
  delete shared.policies;
  function receipt(role) {
    const selectedRole = role === 'runtime' ? 'runtime' : 'application';
    return {
      ...structuredClone(shared),
      receipt_id: `receipt-${role}-1`,
      receipt_type: role,
      span_id:
        role === 'runtime' ? request.span_id : vector.response.payload.span_id,
      policy_decision: {
        type: 'policy.decision',
        decision_id: `decision-${role}-1`,
        enforcer: {
          type: selectedRole,
          id:
            role === 'runtime' ? expected.runtime.runtime_id : expected.app_id,
        },
        outcome: 'allow',
        policy: structuredClone(expected.policies[selectedRole]),
        reason_code: 'policy_allowed',
        matched_rules: ['grant.selected', 'action.selected'],
        safe_to_show: 'The selected proposal was allowed by this producer.',
        evaluated_at: '2026-10-03T06:30:00.123456788Z',
      },
      timestamp: '2026-10-03T06:30:00.123456789Z',
      result: role === 'runtime' ? 'authorized_for_forwarding' : 'success',
    };
  }
  const runtimeReceipt = receipt('runtime');
  rehashReceipt(runtimeReceipt);
  const applicationReceipt = {
    ...receipt('app'),
    parent_receipt_hash: runtimeReceipt.receipt_hash,
    output_hash: hash('action-output', vector.output),
  };
  rehashReceipt(applicationReceipt);
  return relink({ ...vector, expected, runtimeReceipt, applicationReceipt });
}
