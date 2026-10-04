/** Symbolic, synchronous TEST FIXTURE. No credentials, real Grant, persistence,
 * authentication, provider leases or exported SDK API are implemented here. */
export type ApprovedReference = object;
export type AttemptOutcome = 'rejected' | 'committed' | 'unknown';
export type CommitScenario =
  | 'acknowledged'
  | 'lost-after-commit'
  | 'lost-before-commit'
  | 'pending';
export type ExternalCoverage =
  | { kind: 'ordered'; revision: number; validUntil: number }
  | { kind: 'unfenced' | 'unavailable' };

export type RetainedInput = Readonly<{
  material: string;
  localPreview: string;
  issuerConsent: string;
  now: number;
}>;

/** Pure selected-binding check, not a real ASP material/actor validator. */
export class FixtureRetainedBinding {
  validate(input: RetainedInput): void {
    if (
      input.material !== input.localPreview ||
      input.material !== input.issuerConsent ||
      !Number.isSafeInteger(input.now)
    )
      throw new Error('fixture_binding_invalid');
  }
}

type RecordState = {
  material: string;
  localPreview: string;
  issuerConsent: string;
  externalRevision: number | undefined;
  attempt: string;
  phase: 'approved' | 'pending' | 'committed' | 'closed' | 'revoked';
  quarantined: boolean;
  delivered: boolean;
};

/** The host calls the collaborator within its idealized synchronous boundary.
 * Object identity/key lookup models ownership only; it is not authentication. */
export class NonLiveFinalizationHost {
  readonly #validator: FixtureRetainedBinding;
  readonly #records = new WeakMap<ApprovedReference, RecordState>();
  readonly #attempts = new Map<string, RecordState>();
  readonly #trace: string[] = [];
  #nextAttempt = 1;
  #insideBoundary = false;

  constructor(validator: FixtureRetainedBinding) {
    this.#validator = validator;
  }

  approve(
    material: string,
    localPreview = material,
    issuerConsent = material,
    externalRevision?: number,
  ): ApprovedReference {
    const reference = Object.freeze({});
    const record: RecordState = {
      material,
      localPreview,
      issuerConsent,
      externalRevision,
      attempt: `fixture-attempt-${this.#nextAttempt++}`,
      phase: 'approved',
      quarantined: false,
      delivered: false,
    };
    this.#records.set(reference, record);
    this.#attempts.set(record.attempt, record);
    return reference;
  }

  replace(
    reference: ApprovedReference,
    freshMaterial: string,
  ): ApprovedReference {
    const previous = this.#record(reference);
    if (
      previous.quarantined ||
      (previous.phase !== 'closed' && previous.phase !== 'revoked')
    )
      throw new Error('replacement_blocked');
    // Fresh symbolic decisions, never reuse the old approved record.
    return this.approve(
      freshMaterial,
      freshMaterial,
      freshMaterial,
      previous.externalRevision,
    );
  }

  finalize(
    reference: ApprovedReference,
    now: number,
    scenario: CommitScenario,
    coverage?: ExternalCoverage,
  ): AttemptOutcome {
    const record = this.#record(reference);
    if (record.phase !== 'approved' || record.quarantined)
      throw new Error('attempt_not_open');
    if (this.#insideBoundary) throw new Error('fixture_boundary_reentrant');
    this.#insideBoundary = true;
    this.#trace.push('host:enter-boundary');
    try {
      // Only known prepublication checks map to rejection. Never catch an
      // adapter/commit exception and reinterpret it as a rollback.
      try {
        this.#trace.push('host:invoke-pure-validator');
        this.#validator.validate(
          Object.freeze({
            material: record.material,
            localPreview: record.localPreview,
            issuerConsent: record.issuerConsent,
            now,
          }),
        );
        if (
          record.externalRevision !== undefined &&
          (coverage?.kind !== 'ordered' ||
            coverage.revision !== record.externalRevision ||
            !Number.isSafeInteger(coverage.validUntil) ||
            coverage.validUntil <= now)
        )
          throw new Error('external_coverage_missing');
      } catch {
        record.phase = 'closed';
        return 'rejected';
      }
      // Paired symbolic publication only; not a complete Grant/verifier store.
      record.phase =
        scenario === 'pending'
          ? 'pending'
          : scenario === 'lost-before-commit'
            ? 'closed'
            : 'committed';
      this.#trace.push(
        record.phase === 'committed'
          ? 'host:paired-symbolic-commit'
          : `host:${record.phase}`,
      );
      if (scenario !== 'acknowledged') {
        record.quarantined = true;
        return 'unknown';
      }
      return 'committed';
    } finally {
      this.#insideBoundary = false;
      this.#trace.push('host:leave-boundary');
    }
  }

  /** Simulated original-transaction termination, not an implementation of DB
   * cancellation. Used to ensure a missing row cannot hide a later commit. */
  settle(reference: ApprovedReference, committed: boolean): void {
    const record = this.#record(reference);
    if (record.phase !== 'pending') throw new Error('attempt_not_pending');
    record.phase = committed ? 'committed' : 'closed';
  }

  reconcile(
    reference: ApprovedReference,
    read: 'authoritative' | 'stale' | 'unavailable',
  ): 'committed-frozen' | 'no-commit-closed' | 'unknown' {
    const record = this.#record(reference);
    if (!record.quarantined) throw new Error('attempt_not_quarantined');
    // Real adapters must implement ordered, authoritative reads by this key.
    const indexed = this.#attempts.get(record.attempt);
    if (indexed !== record) throw new Error('fixture_attempt_index_invalid');
    if (read !== 'authoritative' || record.phase === 'pending')
      return 'unknown';
    if (record.phase === 'committed') return 'committed-frozen';
    if (record.phase !== 'closed') throw new Error('fixture_outcome_invalid');
    record.quarantined = false;
    return 'no-commit-closed';
  }

  confirmRevocation(reference: ApprovedReference): void {
    const record = this.#record(reference);
    if (record.phase !== 'committed' || !record.quarantined)
      throw new Error('revocation_not_pending');
    record.phase = 'revoked';
    record.quarantined = false;
  }

  deliver(reference: ApprovedReference): void {
    const record = this.#record(reference);
    if (record.phase !== 'committed' || record.quarantined || record.delivered)
      throw new Error('delivery_not_eligible');
    record.delivered = true;
    this.#trace.push('host:symbolic-delivery');
  }

  observe(reference: ApprovedReference) {
    const record = this.#record(reference);
    return Object.freeze({
      attempt: record.attempt,
      phase: record.phase,
      quarantined: record.quarantined,
      delivered: record.delivered,
      trace: Object.freeze([...this.#trace]),
    });
  }

  #record(reference: ApprovedReference): RecordState {
    const record = this.#records.get(reference);
    if (!record) throw new Error('untrusted_record_reference');
    return record;
  }
}
