import { CanonicalObjectHash } from '../../src/canonical-object-hash.js';
import { JsonDocument } from '../../src/json-document.js';
import {
  type PreparedOfflineProposalManifest,
  retainedOfflineProposalDocument,
} from '../../src/offline-proposal-manifest.js';

const INPUT_DOMAIN =
  'https://github.com/0al-spec/agent-surface/hash/action-input/v1';
const OUTPUT_DOMAIN =
  'https://github.com/0al-spec/agent-surface/hash/action-output/v1';

type Tuple = {
  grant_id: string;
  session_generation: number;
  subject: string;
  runtime: string;
  agent: string;
  audience: string;
  surface_hash: string;
};
type State = {
  tuple: Tuple;
  active: boolean;
  expiresAt: number;
  identityUntil: number;
  identity: 'active' | 'revoked' | 'unavailable';
  remaining: number;
  entries: number;
};
export type FixtureAccess = Readonly<{ fixture_reference: string }>;

/**
 * Private synchronous host-domain model, NOT an ASP issuer/store/verifier.
 * Opaque object custody models trusted lookup; no credential, signed identity,
 * Grant integrity, receipts, transport, persistence or interop is implemented.
 */
export class FixtureDispatchDomain {
  readonly #records = new WeakMap<FixtureAccess, State>();
  #now = 0;
  #retired = false;
  #issued = 0;
  #onVerify: () => void = () => {};

  provision(surfaceHash: string, quota = 1): FixtureAccess {
    if (this.#retired) throw new Error('unauthorized');
    if (!Number.isSafeInteger(quota) || quota < 1)
      throw new Error('quota_invalid');
    const reference = Object.freeze({ fixture_reference: `${++this.#issued}` });
    this.#records.set(reference, {
      tuple: {
        grant_id: `symbolic-grant-${this.#issued}`,
        session_generation: 1,
        subject: 'fixture-user',
        runtime: 'fixture-runtime',
        agent: 'fixture-agent',
        audience: 'fixture-app',
        surface_hash: surfaceHash,
      },
      active: true,
      expiresAt: 60,
      identityUntil: 60,
      identity: 'active',
      remaining: quota,
      entries: 0,
    });
    return reference;
  }

  tuple(reference: FixtureAccess): Tuple {
    return structuredClone(this.#record(reference).tuple);
  }

  verify(reference: FixtureAccess): void {
    this.#assertCurrent(this.#record(reference));
    this.#onVerify();
  }

  /** No trusted callback occurs between these reads, quota claim and entry. */
  dispatch<T>(
    reference: FixtureAccess,
    expected: unknown,
    signal: AbortSignal | undefined,
    behavior: () => T,
  ): T {
    const record = this.#record(reference);
    this.#assertCurrent(record);
    if (JSON.stringify(expected) !== JSON.stringify(record.tuple))
      throw new Error('binding_mismatch');
    if (signal?.aborted) throw new Error('aborted');
    if (record.remaining <= 0) throw new Error('quota_exceeded');
    record.remaining--;
    record.entries++;
    return behavior();
  }

  revoke(reference: FixtureAccess): void {
    this.#record(reference).active = false;
  }
  rotate(reference: FixtureAccess): void {
    this.#record(reference).tuple.session_generation++;
  }
  retire(): void {
    this.#retired = true;
  }
  advanceTo(time: number): void {
    this.#now = time;
  }
  identity(
    reference: FixtureAccess,
    status: State['identity'],
    until = 60,
  ): void {
    const record = this.#record(reference);
    record.identity = status;
    record.identityUntil = until;
  }
  duringVerification(callback: () => void): void {
    this.#onVerify = callback;
  }
  observe(reference?: FixtureAccess) {
    const record =
      reference === undefined ? undefined : this.#record(reference);
    return {
      issued: this.#issued,
      entries: record?.entries ?? 0,
      remaining: record?.remaining,
    };
  }

  #record(reference: FixtureAccess): State {
    const record = this.#records.get(reference);
    if (record === undefined) throw new Error('unauthorized');
    return record;
  }
  #assertCurrent(record: State): void {
    if (
      this.#retired ||
      !record.active ||
      !Number.isFinite(this.#now) ||
      this.#now >= record.expiresAt
    )
      throw new Error('unauthorized');
    if (record.identity !== 'active')
      throw new Error(`identity_evidence_${record.identity}`);
    if (this.#now >= record.identityUntil)
      throw new Error('identity_evidence_expired');
  }
}

interface Selection {
  readonly action_id: string;
  readonly mode: 'propose';
  readonly surface_hash: string;
}

/** Capture only. Preparation is inert with respect to issuance and behavior. */
export class FixtureHandlerBinding<Input> {
  readonly #manifest: PreparedOfflineProposalManifest;
  readonly #selection: Readonly<Selection>;
  readonly #decode: (document: JsonDocument) => Input;
  readonly #handler: (input: Input) => unknown;

  constructor(
    manifest: PreparedOfflineProposalManifest,
    selection: Selection,
    decode: (document: JsonDocument) => Input,
    handler: (input: Input) => unknown,
  ) {
    this.#manifest = manifest;
    this.#selection = Object.freeze({ ...selection });
    this.#decode = decode;
    this.#handler = handler;
  }

  prepare(domain: FixtureDispatchDomain) {
    if (!(domain instanceof FixtureDispatchDomain))
      throw new Error('dispatch_domain_missing');
    // Use the real package's retained-manifest provenance, not a structural cast.
    const document = retainedOfflineProposalDocument(
      this.#manifest,
    ).parse() as {
      actions: Array<{ id: string; execution: { mode: string } }>;
    };
    const action = document.actions[0];
    if (
      document.actions.length !== 1 ||
      action?.id !== this.#selection.action_id ||
      action.execution.mode !== this.#selection.mode ||
      this.#selection.mode !== 'propose' ||
      this.#manifest.hash() !== this.#selection.surface_hash ||
      typeof this.#decode !== 'function' ||
      typeof this.#handler !== 'function'
    )
      throw new Error('binding_mismatch');
    const invoke = (
      access: FixtureAccess,
      source: string,
      signal?: AbortSignal,
    ) => {
      const envelope = exact(new JsonDocument(source).parse(8192), [
        'type',
        'payload',
      ]);
      if (envelope.type !== 'action.request') throw new Error('schema_invalid');
      const request = exact(envelope.payload, [
        'binding',
        'action_id',
        'mode',
        'input',
        'input_hash',
      ]);
      if (
        request.action_id !== this.#selection.action_id ||
        request.mode !== this.#selection.mode
      )
        throw new Error('action_not_allowed');
      const binding = exact(request.binding, Object.keys(domain.tuple(access)));
      if (binding.surface_hash !== this.#selection.surface_hash)
        throw new Error('binding_mismatch');
      const input = new JsonDocument(JSON.stringify(request.input));
      this.#manifest.validateInput(this.#selection.action_id, input);
      if (
        new CanonicalObjectHash(INPUT_DOMAIN).digest(input) !==
        request.input_hash
      )
        throw new Error('integrity_mismatch');
      domain.verify(access);
      // Domain decoding is trusted application policy and can re-enter. It must
      // precede the final host-owned dispatch fence. Freeze its captured value.
      const captured = freeze(structuredClone(this.#decode(input)));
      const output = domain.dispatch(access, binding, signal, () =>
        this.#handler(captured),
      );
      if (signal?.aborted) throw new Error('aborted');
      const result = new JsonDocument(JSON.stringify(output));
      this.#manifest.validateOutput(this.#selection.action_id, result);
      return Object.freeze({
        action_id: this.#selection.action_id,
        input_hash: request.input_hash,
        output_hash: new CanonicalObjectHash(OUTPUT_DOMAIN).digest(result),
        output: result,
      });
    };
    // No exposed handler, accepted/admitted flag, or preparation-made authority.
    return Object.freeze({ invoke });
  }
}

function exact(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  )
    throw new Error('schema_invalid');
  return value as Record<string, unknown>;
}

function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
