import { CanonicalObjectHash } from './canonical-object-hash.js';
import { JsonDocument } from './json-document.js';
import type { PreparedOfflineProposalManifest } from './offline-proposal-manifest.js';
import {
  deepFreeze,
  identityAdvertisement,
  manifestAction,
  manifestApi,
  manifestScope,
  projectExposure,
  retainedProposalManifest,
  rfc3339,
  structurallyEqual,
  validateIdentityEvidence,
} from './offline-proposal-semantics.js';

const ASP = 'https://github.com/0al-spec/agent-surface/';
const GRANT_HASH_DOMAIN = `${ASP}hash/grant/v1`;

const MAX_GRANT_BYTES = 256 * 1024;
const MAX_IDENTIFIER_UNITS = 256;
const MAX_ARRAY_ENTRIES = 256;

const GRANT_FIELDS = [
  'grant_id',
  'grant_hash',
  'subject',
  'delegate',
  'resource_server',
  'locations',
  'actions',
  'scopes',
  'constraints',
  'data_exposure',
  'credential_profile',
  'credential_binding',
  'audit',
] as const;

type JsonRecord = Record<string, unknown>;

/** Issuer-owned facts against which a selected Grant is checked. */
export interface OfflineSelectedGrantExpectations {
  readonly subjectUser: string;
  readonly runtimeId: string;
  readonly agentId: string;
  readonly credentialAudience: string;
  readonly identityEvidence: JsonDocument;
}

/** A retained Grant value with behavior, not a raw Grant DTO. */
export interface PreparedOfflineSelectedGrant {
  /** Rechecks the retained complete Grant hash. */
  validate(): void;
  /** Recomputes the Grant hash using only the defined self-field exclusion. */
  hash(): string;
  /** Returns a fresh immutable document of the issuer-derived projection. */
  dataExposure(): JsonDocument;
}

/**
 * Bounded offline validation for one selected Host-Provisioned Bearer Grant.
 *
 * This value checks representation, complete hashing content, exact issuer
 * bindings and exposure projection. It does not authenticate identity or
 * consent, consult a clock, issue or present a credential, perform I/O, or
 * admit an Action Request.
 */
export class OfflineSelectedGrant {
  readonly #grant: JsonDocument;
  readonly #manifest: PreparedOfflineProposalManifest;
  readonly #subjectUser: string;
  readonly #runtimeId: string;
  readonly #agentId: string;
  readonly #credentialAudience: string;
  readonly #identityEvidence: JsonDocument;
  #prepared: PreparedOfflineSelectedGrant | undefined;

  constructor(
    grant: JsonDocument,
    manifest: PreparedOfflineProposalManifest,
    expectations: OfflineSelectedGrantExpectations,
  ) {
    // Capture scalar inputs rather than retaining a mutable options object.
    // JsonDocument itself retains source text privately and is immutable.
    this.#grant = grant;
    this.#manifest = manifest;
    this.#subjectUser = expectations.subjectUser;
    this.#runtimeId = expectations.runtimeId;
    this.#agentId = expectations.agentId;
    this.#credentialAudience = expectations.credentialAudience;
    this.#identityEvidence = expectations.identityEvidence;
  }

  /** Validates once and retains a behavior-rich immutable view. */
  prepare(): PreparedOfflineSelectedGrant {
    if (this.#prepared !== undefined) return this.#prepared;
    if (!(this.#grant instanceof JsonDocument))
      throw new Error('invalid_grant_document');
    if (!(this.#identityEvidence instanceof JsonDocument))
      throw new Error('invalid_identity_metadata');

    const grant = this.#parseGrant();
    const supplied = grant.grant_hash;
    if (typeof supplied !== 'string') throw new Error('grant_hash_required');
    if (!isDigest(supplied)) incompatible();

    const computed = grantHash(grant);
    if (supplied !== computed) throw new Error('grant_hash_mismatch');

    const manifest = this.#manifestDocument();
    const identityAdvertisementValue = identityAdvertisement(manifest);
    const expectedIdentity = record(
      this.#identityEvidence.parse(MAX_GRANT_BYTES),
    );
    validateIdentityEvidence(expectedIdentity, identityAdvertisementValue);

    const projection = this.#validateGrant(
      grant,
      manifest,
      identityAdvertisementValue,
      expectedIdentity,
    );
    const retained = new RetainedOfflineSelectedGrant(
      this.#grant,
      computed,
      projection,
    );
    this.#prepared = retained;
    return retained;
  }

  /** Explicit validation entry point; successful validation returns the view. */
  validate(): PreparedOfflineSelectedGrant {
    return this.prepare();
  }

  #parseGrant(): JsonRecord {
    try {
      return record(this.#grant.parse(MAX_GRANT_BYTES));
    } catch (error) {
      if (error instanceof Error && error.message === 'json_byte_limit')
        throw new Error('grant_byte_limit');
      throw error;
    }
  }

  #manifestDocument(): JsonRecord {
    return retainedProposalManifest(
      this.#manifest,
      MAX_GRANT_BYTES,
      'manifest_binding_mismatch',
    );
  }

  #validateGrant(
    grant: JsonRecord,
    manifest: JsonRecord,
    identityAdvertisement: JsonRecord,
    expectedIdentity: JsonRecord,
  ): JsonRecord[] {
    fields(grant, GRANT_FIELDS);
    identifier(grant.grant_id, 'grant_incompatible');

    const subject = fields(grant.subject, ['user']);
    if (identifier(subject.user, 'grant_incompatible') !== this.#subjectUser)
      throw new Error('grant_binding_mismatch');

    const delegate = fields(grant.delegate, [
      'runtime',
      'agent',
      'identity_evidence',
    ]);
    if (identifier(delegate.runtime, 'grant_incompatible') !== this.#runtimeId)
      throw new Error('grant_binding_mismatch');
    if (identifier(delegate.agent, 'grant_incompatible') !== this.#agentId)
      throw new Error('grant_binding_mismatch');

    const resourceServer = fields(grant.resource_server, [
      'app_id',
      'issuer',
      'surface_version',
      'surface_hash',
    ]);
    const manifestApp = identifier(manifest.app_id, 'grant_manifest_binding');
    const manifestIssuer = identifier(
      manifest.issuer,
      'grant_manifest_binding',
    );
    const manifestVersion = identifier(
      manifest.surface_version,
      'grant_manifest_binding',
    );
    const manifestSurfaceHash = identifier(
      manifest.surface_hash,
      'grant_manifest_binding',
    );
    if (
      resourceServer.app_id !== manifestApp ||
      resourceServer.issuer !== manifestIssuer ||
      resourceServer.surface_version !== manifestVersion ||
      resourceServer.surface_hash !== manifestSurfaceHash
    )
      throw new Error('grant_binding_mismatch');

    const action = manifestAction(manifest, this.#manifest.actionId);
    const scope = manifestScope(manifest);
    const api = manifestApi(manifest);
    const audience = identifier(
      api.credential_audience,
      'grant_manifest_binding',
    );
    if (audience !== this.#credentialAudience)
      throw new Error('grant_audience_mismatch');

    this.#exactSingletonList(grant.locations, api.action_url, 'locations');
    this.#exactSingletonList(grant.actions, action.id, 'actions');
    this.#exactSingletonList(grant.scopes, scope.id, 'scopes');

    exactText(grant.credential_profile, 'compatibility_bearer');
    const binding = fields(grant.credential_binding, [
      'method',
      'runtime_id',
      'agent_id',
      'identity_evidence',
    ]);
    exactText(binding.method, 'bearer');
    if (
      identifier(binding.runtime_id, 'grant_incompatible') !==
        this.#runtimeId ||
      identifier(binding.agent_id, 'grant_incompatible') !== this.#agentId
    )
      throw new Error('grant_binding_mismatch');

    const delegateEvidence = record(delegate.identity_evidence);
    const bindingEvidence = record(binding.identity_evidence);
    validateIdentityEvidence(delegateEvidence, identityAdvertisement);
    validateIdentityEvidence(bindingEvidence, identityAdvertisement);
    if (
      !structurallyEqual(delegateEvidence, bindingEvidence) ||
      !structurallyEqual(delegateEvidence, expectedIdentity)
    )
      throw new Error('grant_identity_mismatch');

    this.#constraints(grant.constraints);
    const audit = fields(grant.audit, ['local_receipt', 'app_receipt']);
    exactText(audit.local_receipt, 'required');
    exactText(audit.app_receipt, 'required');

    const projection = projectExposure(manifest, action.id, scope.id);
    const receivedProjection = boundedArray(
      grant.data_exposure,
      'grant_data_exposure_mismatch',
    );
    if (!structurallyEqual(receivedProjection, projection))
      throw new Error('grant_data_exposure_mismatch');
    return projection;
  }

  #exactSingletonList(value: unknown, expected: unknown, name: string): void {
    const values = boundedArray(value, 'grant_incompatible');
    if (
      values.length !== 1 ||
      typeof values[0] !== 'string' ||
      values[0] !== expected
    )
      throw new Error(`grant_${name}_mismatch`);
  }

  #constraints(value: unknown): void {
    const constraints = fields(value, ['expires_at', 'credential_release']);
    if (!rfc3339(constraints.expires_at))
      throw new Error('grant_constraints_invalid');
    const release = fields(constraints.credential_release, ['mode']);
    exactText(release.mode, 'deny');
  }
}

class RetainedOfflineSelectedGrant implements PreparedOfflineSelectedGrant {
  readonly #grant: JsonDocument;
  readonly #grantHash: string;
  readonly #projection: JsonRecord[];

  constructor(
    grant: JsonDocument,
    grantHashValue: string,
    projection: JsonRecord[],
  ) {
    this.#grant = grant;
    this.#grantHash = grantHashValue;
    this.#projection = deepFreeze(projection);
    Object.freeze(this);
  }

  validate(): void {
    this.hash();
  }

  hash(): string {
    const grant = record(this.#grant.parse(MAX_GRANT_BYTES));
    if (grant.grant_hash !== this.#grantHash)
      throw new Error('grant_hash_mismatch');
    const current = grantHash(grant);
    if (current !== this.#grantHash) throw new Error('grant_hash_mismatch');
    return current;
  }

  dataExposure(): JsonDocument {
    return new JsonDocument(JSON.stringify(this.#projection));
  }
}

function grantHash(grant: JsonRecord): string {
  const view = { ...grant };
  delete view.grant_hash;
  return new CanonicalObjectHash(GRANT_HASH_DOMAIN).digest(
    new JsonDocument(JSON.stringify(view)),
  );
}

function record(value: unknown): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    incompatible();
  return value as JsonRecord;
}

function fields(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): JsonRecord {
  const object = record(value);
  if (required.some((key) => !Object.hasOwn(object, key))) incompatible();
  if (
    Object.keys(object).some(
      (key) => !required.includes(key) && !optional.includes(key),
    )
  )
    incompatible();
  return object;
}

function boundedArray(value: unknown, error: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(error);
  if (value.length > MAX_ARRAY_ENTRIES) throw new Error(error);
  return value;
}

function identifier(value: unknown, error: string): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > MAX_IDENTIFIER_UNITS
  )
    throw new Error(error);
  return value;
}

function exactText(value: unknown, expected: string): void {
  if (value !== expected) incompatible();
}

function isDigest(value: unknown): value is string {
  // For 32-byte SHA-256 values, the final unpadded base64url character has
  // two zero pad bits and therefore must have an alphabet index divisible by
  // four. Reject alternate spellings instead of accepting a noncanonical
  // encoding of the same digest bytes.
  return (
    typeof value === 'string' &&
    /^sha-256:[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value)
  );
}

function incompatible(): never {
  throw new Error('grant_incompatible');
}
