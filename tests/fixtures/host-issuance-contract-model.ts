/**
 * NON-LIVE TEST FIXTURE ONLY. This model does not authenticate a host user,
 * issue or store a Grant or credential, deliver authority, or certify an
 * adapter. Its counters and trace are symbolic transition observations.
 * Material labels stand for immutable content protected by a qualified host
 * revision contract; this fixture does not duplicate canonical hashing.
 */

export const HOST_CONTRACT_MATERIALS = [
  'principal',
  'runtime',
  'identity',
  'policy',
  'snapshot',
  'schema',
  'request',
  'projection',
] as const;

export type HostContractMaterial = (typeof HOST_CONTRACT_MATERIALS)[number];
export type FixtureReference = object;
export type FixtureConsent = object;
export type ConsentKind = 'local-preview' | 'issuer';
export type CommitPoint = 'before-linearization' | 'after-linearization';
export type DeliveryOutcome = 'acknowledged' | 'uncertain';
export type RestartStrategy =
  | 'retain-state'
  | 'invalidate-old-epoch'
  | 'unsupported';

type Source = {
  revision: number;
  deadline: number;
  active: boolean;
};

type CapturedSource = Pick<Source, 'revision' | 'deadline'>;
type CapturedMaterial = Record<HostContractMaterial, CapturedSource>;
type RecordState = {
  id: string;
  binding: string;
  captured: CapturedMaterial;
  status:
    | 'approved'
    | 'invalidated'
    | 'committed'
    | 'delivered'
    | 'frozen'
    | 'revoked'
    | 'epoch-invalidated';
  attempted: boolean;
  consumed: boolean;
  consentRevision: number;
  needsRevocation: boolean;
  epoch: number;
};
type ConsentState = {
  record: RecordState;
  kind: ConsentKind;
  binding: string;
  revision: number;
  withdrawn: boolean;
};

/** A deliberately idealized in-memory host-contract qualification model. */
export class NonLiveHostIssuanceContractModel {
  readonly #sources = new Map<HostContractMaterial, Source>(
    HOST_CONTRACT_MATERIALS.map((material) => [
      material,
      { revision: 1, deadline: 1_000, active: true },
    ]),
  );
  readonly #records: RecordState[] = [];
  readonly #recordByReference = new WeakMap<object, RecordState>();
  readonly #consentByReference = new WeakMap<object, ConsentState>();
  readonly #trace: string[] = [];
  #now = 10;
  #nextReference = 1;
  #symbolicCommitCount = 0;
  #symbolicVerifierEligibilityCount = 0;
  #privateDeliveryAttemptCount = 0;
  #confirmedPrivateDeliveryCount = 0;
  #confirmedRevocationCount = 0;
  #symbolicEpochInvalidationCount = 0;
  #epoch = 1;
  #identityExternal = false;
  #identityOrderingQualified = true;
  #recoveryBlocked = false;

  /** Creates a process-local object reference; copied IDs are not looked up. */
  approveCurrentMaterial(): FixtureReference {
    this.#assertAvailable();
    const id = `fixture-approved-${this.#nextReference++}`;
    const reference = Object.freeze({ id });
    const record: RecordState = {
      id,
      binding: this.#binding(),
      captured: this.#capture(),
      status: 'approved',
      attempted: false,
      consumed: false,
      consentRevision: 1,
      needsRevocation: false,
      epoch: this.#epoch,
    };
    this.#recordByReference.set(reference, record);
    this.#records.push(record);
    this.#trace.push('record-approved-symbolically');
    return reference;
  }

  /** Records one distinct symbolic consent decision over a binding. */
  recordConsent(
    reference: FixtureReference,
    kind: ConsentKind,
    binding?: string,
  ): FixtureConsent {
    const record = this.#record(reference);
    if (record.status !== 'approved' || record.attempted || record.consumed)
      throw new Error('approved_record_not_open');
    const consent = Object.freeze({ id: `fixture-${kind}-${record.id}` });
    this.#consentByReference.set(consent, {
      record,
      kind,
      binding: binding ?? record.binding,
      revision: record.consentRevision,
      withdrawn: false,
    });
    this.#trace.push(`consent-recorded:${kind}`);
    return consent;
  }

  /** Withdrawal changes consent authority, not caller-owned material. */
  withdrawConsent(consent: FixtureConsent): void {
    const decision = this.#consentByReference.get(consent);
    if (!decision || decision.withdrawn)
      throw new Error('untrusted_consent_reference');
    decision.withdrawn = true;
    decision.record.consentRevision++;
    if (decision.record.status === 'approved') {
      decision.record.status = 'invalidated';
    } else if (
      decision.record.status === 'committed' ||
      decision.record.status === 'delivered'
    ) {
      decision.record.needsRevocation = true;
    }
    this.#trace.push(`consent-withdrawn:${decision.kind}`);
  }

  /**
   * Performs one synchronous, simulated commit fence. The hook is a
   * deterministic interleaving aid, not a database/serializability claim.
   */
  commit(
    reference: FixtureReference,
    decisions: { localPreview?: FixtureConsent; issuer?: FixtureConsent },
    interleave?: (point: CommitPoint) => void,
  ): void {
    const record = this.#record(reference);
    this.#assertOpen(record);
    record.attempted = true;
    try {
      this.#assertAvailable();
      this.#assertDecisions(record, decisions);
      this.#assertTrustedPrincipalAndRuntime();
      this.#assertExternalOrdering();

      interleave?.('before-linearization');
      this.#assertAvailable();
      this.#assertDecisions(record, decisions);
      this.#assertTrustedPrincipalAndRuntime();
      this.#assertExternalOrdering();
      this.#assertCurrent(record);

      // This assignment and both symbolic effects are one synchronous model step.
      record.consumed = true;
      record.status = 'committed';
      this.#symbolicCommitCount++;
      this.#symbolicVerifierEligibilityCount++;
      this.#trace.push('symbolic-grant-and-verifier-eligibility-committed');

      interleave?.('after-linearization');
    } catch (error) {
      if (record.consumed) {
        record.status = 'frozen';
        record.needsRevocation = true;
        this.#trace.push('postcommit-outcome-uncertain-freeze');
      } else {
        record.status = 'invalidated';
      }
      throw error;
    }
  }

  /** Models only an acknowledged or uncertain handoff on a private channel. */
  deliverPrivately(
    reference: FixtureReference,
    outcome: DeliveryOutcome,
  ): void {
    const record = this.#record(reference);
    if (record.status !== 'committed' || record.needsRevocation)
      throw new Error('symbolic_delivery_not_eligible');
    this.#privateDeliveryAttemptCount++;
    if (outcome === 'uncertain') {
      record.status = 'frozen';
      record.needsRevocation = true;
      this.#trace.push('private-delivery-uncertain-freeze');
      return;
    }
    record.status = 'delivered';
    this.#confirmedPrivateDeliveryCount++;
    this.#trace.push('private-symbolic-delivery-acknowledged');
  }

  /** A confirmed symbolic revocation resolves a frozen or stale committed row. */
  confirmRevocation(reference: FixtureReference): void {
    const record = this.#record(reference);
    if (!record.needsRevocation || record.status === 'revoked')
      throw new Error('revocation_not_pending');
    record.status = 'revoked';
    record.needsRevocation = false;
    this.#confirmedRevocationCount++;
    this.#trace.push('symbolic-revocation-confirmed');
  }

  /** Changes one same-domain revision and orders it synchronously in this model. */
  invalidate(material: HostContractMaterial): void {
    const source = this.#source(material);
    source.revision++;
    for (const record of this.#records) {
      if (record.status === 'approved' && !record.consumed) {
        record.status = 'invalidated';
      } else if (
        record.status === 'committed' ||
        record.status === 'delivered'
      ) {
        record.needsRevocation = true;
      }
    }
    this.#trace.push(`source-invalidated:${material}`);
  }

  setActive(material: HostContractMaterial, active: boolean): void {
    const source = this.#source(material);
    source.active = active;
    this.invalidate(material);
  }

  setDeadline(material: HostContractMaterial, deadline: number): void {
    this.#source(material).deadline = deadline;
  }

  advanceTo(time: number): void {
    this.#now = time;
  }

  markIdentityAsExternal(orderingQualified: boolean): void {
    this.#identityExternal = true;
    this.#identityOrderingQualified = orderingQualified;
  }

  /** Recovery policies are symbolic; this does not prove restart safety. */
  recoverAfterRestart(strategy: RestartStrategy): void {
    if (strategy === 'unsupported') {
      this.#recoveryBlocked = true;
      this.#trace.push('restart-blocked-unsupported-recovery');
      return;
    }
    this.#epoch++;
    if (strategy === 'invalidate-old-epoch') {
      for (const record of this.#records) {
        if (
          record.epoch < this.#epoch &&
          record.consumed &&
          record.status !== 'revoked' &&
          record.status !== 'epoch-invalidated'
        ) {
          record.status = 'epoch-invalidated';
          record.needsRevocation = false;
          this.#symbolicEpochInvalidationCount++;
        } else if (record.epoch < this.#epoch && !record.consumed) {
          record.status = 'invalidated';
        }
      }
      this.#trace.push('restart-invalidated-old-epoch-symbolically');
      return;
    }
    // A commit whose private handoff did not finish has uncertain custody after
    // restart. Freeze it until revocation is confirmed; verifier state cannot
    // reconstruct or prove that the raw credential was never delivered.
    for (const record of this.#records) {
      if (record.status !== 'committed' || !record.consumed) continue;
      record.status = 'frozen';
      record.needsRevocation = true;
      this.#trace.push('restart-froze-undelivered-commit');
    }
    // Retaining state never silently clears existing delivery/revocation state.
    this.#trace.push('restart-retained-symbolic-state');
  }

  /** Read-only symbolic counters and status; contains no credential or Grant. */
  observe(reference?: FixtureReference) {
    const record = reference ? this.#record(reference) : undefined;
    return Object.freeze({
      symbolicCommitCount: this.#symbolicCommitCount,
      symbolicVerifierEligibilityCount: this.#symbolicVerifierEligibilityCount,
      privateDeliveryAttemptCount: this.#privateDeliveryAttemptCount,
      confirmedPrivateDeliveryCount: this.#confirmedPrivateDeliveryCount,
      confirmedRevocationCount: this.#confirmedRevocationCount,
      symbolicEpochInvalidationCount: this.#symbolicEpochInvalidationCount,
      recordStatus: record?.status,
      recordConsumed: record?.consumed,
      recordNeedsRevocation: record?.needsRevocation,
      trace: Object.freeze([...this.#trace]),
    });
  }

  #assertAvailable() {
    if (this.#recoveryBlocked) throw new Error('restart_recovery_unsupported');
    if (
      this.#records.some(
        (record) => record.needsRevocation && record.status !== 'revoked',
      )
    ) {
      throw new Error('symbolic_authority_frozen_pending_revocation');
    }
  }

  #assertOpen(record: RecordState) {
    if (record.status !== 'approved' || record.attempted || record.consumed)
      throw new Error('approved_record_not_open');
    if (record.epoch !== this.#epoch)
      throw new Error('approved_record_epoch_stale');
  }

  #assertTrustedPrincipalAndRuntime() {
    if (!this.#source('principal').active)
      throw new Error('host_principal_missing');
    if (!this.#source('runtime').active)
      throw new Error('runtime_registration_missing');
  }

  #assertExternalOrdering() {
    if (this.#identityExternal && !this.#identityOrderingQualified)
      throw new Error('external_identity_ordering_unqualified');
  }

  #assertDecisions(
    record: RecordState,
    decisions: { localPreview?: FixtureConsent; issuer?: FixtureConsent },
  ) {
    const local = decisions.localPreview
      ? this.#consentByReference.get(decisions.localPreview)
      : undefined;
    const issuer = decisions.issuer
      ? this.#consentByReference.get(decisions.issuer)
      : undefined;
    if (!local || !issuer) throw new Error('both_consent_decisions_required');
    if (
      local.record !== record ||
      issuer.record !== record ||
      local.kind !== 'local-preview' ||
      issuer.kind !== 'issuer'
    ) {
      throw new Error('consent_reference_mismatch');
    }
    if (
      local.withdrawn ||
      issuer.withdrawn ||
      local.revision !== record.consentRevision ||
      issuer.revision !== record.consentRevision
    ) {
      throw new Error('consent_withdrawn_or_changed');
    }
    const currentBinding = this.#binding();
    if (
      local.binding !== record.binding ||
      issuer.binding !== record.binding ||
      currentBinding !== record.binding
    ) {
      throw new Error('consent_material_mismatch');
    }
  }

  #assertCurrent(record: RecordState) {
    if (
      record.status !== 'approved' ||
      record.consumed ||
      record.epoch !== this.#epoch
    )
      throw new Error('approved_record_invalidated');
    for (const material of HOST_CONTRACT_MATERIALS) {
      const current = this.#source(material);
      const captured = record.captured[material];
      if (
        !current.active ||
        current.revision !== captured.revision ||
        current.deadline !== captured.deadline ||
        current.deadline <= this.#now
      ) {
        record.status = 'invalidated';
        throw new Error(`material_invalidated:${material}`);
      }
    }
  }

  #capture(): CapturedMaterial {
    return Object.fromEntries(
      HOST_CONTRACT_MATERIALS.map((material) => {
        const source = this.#source(material);
        return [
          material,
          { revision: source.revision, deadline: source.deadline },
        ];
      }),
    ) as CapturedMaterial;
  }

  #binding(): string {
    return HOST_CONTRACT_MATERIALS.map((material) => {
      const source = this.#source(material);
      return `${material}:${source.revision}:${source.deadline}`;
    }).join('|');
  }

  #record(reference: FixtureReference): RecordState {
    const record = this.#recordByReference.get(reference);
    if (!record) throw new Error('untrusted_fixture_reference');
    return record;
  }

  #source(material: HostContractMaterial): Source {
    const source = this.#sources.get(material);
    if (!source) throw new Error('unknown_fixture_material');
    return source;
  }
}
