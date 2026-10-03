import { CanonicalObjectHash, JsonDocument } from '@0al/agent-surface';
import {
  CORRELATION_FIELDS,
  closed,
  digest,
  identifier,
  positiveLimit,
  trace,
} from './wire.js';

type RecordValue = Record<string, unknown>;
const HASH = 'https://github.com/0al-spec/agent-surface/hash/';
const CONTEXT_FIELDS = [
  ...CORRELATION_FIELDS,
  'span_id',
  'input_hash',
  'execution',
  'app_id',
  'surface_version',
  'runtime',
  'actor_agent',
  'subject',
  'policies',
];
const RECEIPT_FIELDS = [
  ...CONTEXT_FIELDS.filter((field) => field !== 'policies'),
  'receipt_id',
  'receipt_type',
  'receipt_hash',
  'policy_decision',
  'policy_decision_hash',
  'timestamp',
  'result',
];
const DECISION_FIELDS = [
  'type',
  'decision_id',
  'enforcer',
  'outcome',
  'policy',
  'reason_code',
  'matched_rules',
  'safe_to_show',
  'evaluated_at',
  'policy_decision_hash',
];
const UNVERIFIED = Object.freeze({
  receipt_integrity: 'checked' as const,
  producer_authentication: 'not_verified' as const,
  current_authority: 'not_verified' as const,
  trusted_time: 'not_verified' as const,
  application_acceptance: 'not_verified' as const,
});

export interface ReceiptIntegrityChecked {
  readonly status: 'integrity_checked';
  readonly assurance: typeof UNVERIFIED;
  unverifiedOutput(): JsonDocument;
  /** Fresh owned complete runtime/app values; contains audit data, not UI projection. */
  receipts(): JsonDocument;
}

/** Private selected pair: internal consistency does not authenticate its producers. */
export class ProposalReceiptPair {
  readonly #outputText: string;
  readonly #evidenceText: string;
  readonly #expected: JsonDocument;
  readonly #runtime: JsonDocument;
  readonly #app: JsonDocument;
  readonly #maximumBytes: number;

  constructor(
    outputText: string,
    evidenceText: string,
    expected: JsonDocument,
    runtime: JsonDocument,
    app: JsonDocument,
    maximumBytes: number,
  ) {
    this.#outputText = outputText;
    this.#evidenceText = evidenceText;
    this.#expected = expected;
    this.#runtime = runtime;
    this.#app = app;
    this.#maximumBytes = maximumBytes;
  }

  check(): ReceiptIntegrityChecked {
    positiveLimit(this.#maximumBytes);
    const expected = closed(this.#parse(this.#expected), CONTEXT_FIELDS);
    const evidence = new JsonDocument(this.#evidenceText).parse() as {
      request: { payload: RecordValue };
      result: { payload: RecordValue };
      output_hash: string;
    };
    const request = evidence.request.payload;
    const result = evidence.result.payload;
    this.#context(expected);
    for (const field of [...CORRELATION_FIELDS, 'span_id', 'input_hash'])
      equal(expected[field], request[field]);
    executionEqual(expected.execution, request.execution);

    const runtime = this.#receipt(this.#runtime, 'runtime', expected);
    const app = this.#receipt(this.#app, 'app', expected);
    equal(runtime.receipt_hash, request.parent_receipt_hash);
    equal(runtime.span_id, request.span_id);
    equal(app.parent_receipt_hash, runtime.receipt_hash);
    equal(app.receipt_id, result.receipt_id);
    equal(app.receipt_hash, result.receipt_hash);
    equal(app.span_id, result.span_id);
    equal(app.output_hash, evidence.output_hash);
    if (runtime.receipt_id === app.receipt_id)
      throw new Error('proposal_receipt_identity_conflict');
    if (runtime.span_id === app.span_id)
      throw new Error('proposal_app_span_required');

    return Object.freeze(
      new CheckedReceiptPair(
        this.#outputText,
        JSON.stringify({ runtime, app }),
      ),
    );
  }

  /** Request-side structure/integrity only; never producer authentication. */
  checkRuntime(): void {
    positiveLimit(this.#maximumBytes);
    const expected = closed(this.#parse(this.#expected), CONTEXT_FIELDS);
    const evidence = new JsonDocument(this.#evidenceText).parse() as {
      request: { payload: RecordValue };
    };
    const request = evidence.request.payload;
    this.#context(expected);
    for (const field of [...CORRELATION_FIELDS, 'span_id', 'input_hash'])
      equal(expected[field], request[field]);
    executionEqual(expected.execution, request.execution);
    const runtime = this.#receipt(this.#runtime, 'runtime', expected);
    equal(runtime.receipt_hash, request.parent_receipt_hash);
    equal(runtime.span_id, request.span_id);
  }

  #parse(document: JsonDocument): unknown {
    if (!(document instanceof JsonDocument))
      throw new Error('proposal_document_invalid');
    return document.parse(this.#maximumBytes);
  }

  #context(expected: RecordValue): void {
    for (const field of [
      'session_id',
      'grant_id',
      'action_id',
      'app_id',
      'surface_version',
    ])
      identifier(expected[field], 256);
    identifier(expected.idempotency_key, 128);
    if (
      typeof expected.session_generation !== 'number' ||
      !Number.isSafeInteger(expected.session_generation) ||
      expected.session_generation <= 0
    )
      throw new Error('proposal_generation_invalid');
    for (const field of [
      'grant_hash',
      'surface_hash',
      'execution_hash',
      'input_hash',
    ])
      digest(expected[field]);
    trace(expected.trace_id, 32);
    trace(expected.span_id, 16);
    const execution = closed(expected.execution, ['mode', 'execution_id']);
    if (execution.mode !== 'propose')
      throw new Error('proposal_mode_unsupported');
    identifier(execution.execution_id, 128);
    identifier(closed(expected.runtime, ['runtime_id']).runtime_id, 256);
    const actor = closed(expected.actor_agent, [
      'agent_id',
      'identity_evidence_hash',
    ]);
    identifier(actor.agent_id, 256);
    digest(actor.identity_evidence_hash);
    identifier(closed(expected.subject, ['user']).user, 256);
    const policies = closed(expected.policies, ['runtime', 'application']);
    for (const role of ['runtime', 'application']) policy(policies[role]);
  }

  #receipt(
    document: JsonDocument,
    role: 'runtime' | 'app',
    expected: RecordValue,
  ): RecordValue {
    const parsed = this.#parse(document);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Object.hasOwn(parsed, 'receipt_signatures')
    )
      throw new Error('proposal_receipt_signing_unsupported');
    const receipt = closed(
      parsed,
      role === 'runtime'
        ? RECEIPT_FIELDS
        : [...RECEIPT_FIELDS, 'parent_receipt_hash', 'output_hash'],
    );
    identifier(receipt.receipt_id, 256);
    if (
      receipt.receipt_type !== role ||
      receipt.result !==
        (role === 'runtime' ? 'authorized_for_forwarding' : 'success')
    )
      throw new Error('proposal_receipt_role_invalid');
    for (const field of ['receipt_hash', 'policy_decision_hash'])
      digest(receipt[field]);
    if (role === 'app') {
      digest(receipt.parent_receipt_hash);
      digest(receipt.output_hash);
    }
    for (const field of [
      ...CORRELATION_FIELDS,
      'input_hash',
      'app_id',
      'surface_version',
    ])
      equal(receipt[field], expected[field]);
    executionEqual(receipt.execution, expected.execution);
    const runtime = closed(receipt.runtime, ['runtime_id']);
    equal(runtime.runtime_id, (expected.runtime as RecordValue).runtime_id);
    const actor = closed(receipt.actor_agent, [
      'agent_id',
      'identity_evidence_hash',
    ]);
    equal(actor.agent_id, (expected.actor_agent as RecordValue).agent_id);
    equal(
      actor.identity_evidence_hash,
      (expected.actor_agent as RecordValue).identity_evidence_hash,
    );
    equal(
      closed(receipt.subject, ['user']).user,
      (expected.subject as RecordValue).user,
    );
    trace(receipt.span_id, 16);
    const timestamp = utc(receipt.timestamp);
    this.#decision(receipt, role, expected, timestamp);

    const view = { ...receipt };
    delete view.receipt_hash;
    equal(
      receipt.receipt_hash,
      new CanonicalObjectHash(`${HASH}receipt/v1`).digest(
        new JsonDocument(JSON.stringify(view)),
      ),
    );
    return receipt;
  }

  #decision(
    receipt: RecordValue,
    role: 'runtime' | 'app',
    expected: RecordValue,
    timestamp: string,
  ): void {
    const decision = closed(receipt.policy_decision, DECISION_FIELDS);
    const selectedRole = role === 'runtime' ? 'runtime' : 'application';
    const enforcer = closed(decision.enforcer, ['type', 'id']);
    if (
      decision.type !== 'policy.decision' ||
      decision.outcome !== 'allow' ||
      decision.reason_code !== 'policy_allowed' ||
      enforcer.type !== selectedRole
    )
      throw new Error('proposal_receipt_policy_invalid');
    equal(
      enforcer.id,
      role === 'runtime'
        ? (expected.runtime as RecordValue).runtime_id
        : expected.app_id,
    );
    identifier(decision.decision_id, 256);
    identifier(decision.safe_to_show, 4096);
    const selectedPolicy = (expected.policies as RecordValue)[
      selectedRole
    ] as RecordValue;
    const recordedPolicy = policy(decision.policy);
    equal(recordedPolicy.id, selectedPolicy.id);
    equal(recordedPolicy.version, selectedPolicy.version);
    if (
      !Array.isArray(decision.matched_rules) ||
      decision.matched_rules.length > 64
    )
      throw new Error('proposal_receipt_policy_invalid');
    const rules = new Set<string>();
    for (const rule of decision.matched_rules) {
      identifier(rule, 256);
      if (rules.has(rule as string))
        throw new Error('proposal_receipt_policy_invalid');
      rules.add(rule as string);
    }
    if (utc(decision.evaluated_at) > timestamp)
      throw new Error('proposal_receipt_timestamp_invalid');
    digest(decision.policy_decision_hash);
    const view = { ...decision };
    delete view.policy_decision_hash;
    const hash = new CanonicalObjectHash(`${HASH}policy-decision/v1`).digest(
      new JsonDocument(JSON.stringify(view)),
    );
    equal(decision.policy_decision_hash, hash);
    equal(receipt.policy_decision_hash, hash);
  }
}

class CheckedReceiptPair implements ReceiptIntegrityChecked {
  readonly status = 'integrity_checked' as const;
  readonly assurance = UNVERIFIED;
  readonly #outputText: string;
  readonly #receiptsText: string;

  constructor(outputText: string, receiptsText: string) {
    this.#outputText = outputText;
    this.#receiptsText = receiptsText;
  }

  unverifiedOutput(): JsonDocument {
    return new JsonDocument(this.#outputText);
  }
  receipts(): JsonDocument {
    return new JsonDocument(this.#receiptsText);
  }
}

function equal(actual: unknown, expected: unknown): void {
  if (actual !== expected) throw new Error('proposal_receipt_binding_mismatch');
}

function executionEqual(actual: unknown, expected: unknown): void {
  const execution = closed(actual, ['mode', 'execution_id']);
  const wanted = closed(expected, ['mode', 'execution_id']);
  equal(execution.mode, wanted.mode);
  equal(execution.execution_id, wanted.execution_id);
}

function policy(value: unknown): RecordValue {
  const selected = closed(value, ['id', 'version']);
  identifier(selected.id, 256);
  identifier(selected.version, 256);
  return selected;
}

/** Selected UTC calendar grammar, 0..9 fraction digits, no leap seconds/offsets. */
function utc(value: unknown): string {
  if (typeof value !== 'string')
    throw new Error('proposal_receipt_timestamp_invalid');
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/u.exec(
      value,
    );
  if (!match) throw new Error('proposal_receipt_timestamp_invalid');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    month - 1
  ];
  if (
    days === undefined ||
    day < 1 ||
    day > days ||
    Number(match[4]) > 23 ||
    Number(match[5]) > 59 ||
    Number(match[6]) > 59
  )
    throw new Error('proposal_receipt_timestamp_invalid');
  // For this ordering check only; retain exact timestamp bytes in hashing views.
  return `${value.slice(0, 19)}.${(match[7] ?? '').padEnd(9, '0')}`;
}
