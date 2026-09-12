import { CanonicalObjectHash } from './canonical-object-hash.js';
import { JsonDocument } from './json-document.js';
import {
  type PreparedOfflineProposalManifest,
  retainedOfflineProposalDocument,
} from './offline-proposal-manifest.js';

const ASP = 'https://github.com/0al-spec/agent-surface/';
const GRANT_HASH_DOMAIN = `${ASP}hash/grant/v1`;
const IDENTITY_PROFILE = `${ASP}profiles/agent-identity-evidence/v1`;
const PASSPORT_FORMAT_PROFILE = `${ASP}profiles/agent-passport-minimal/v1`;

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

const IDENTITY_FIELDS = [
  'profile',
  'format_profile',
  'artifact_digest',
  'issuer',
  'subject',
  'verification_profile',
  'key_binding',
  'lifecycle',
] as const;

type JsonRecord = Record<string, unknown>;
type SourceKind = 'resource' | 'action' | 'event';

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
    const identityAdvertisement = this.#identityAdvertisement(manifest);
    const expectedIdentity = record(
      this.#identityEvidence.parse(MAX_GRANT_BYTES),
    );
    validateIdentityEvidence(expectedIdentity, identityAdvertisement);

    const projection = this.#validateGrant(
      grant,
      manifest,
      identityAdvertisement,
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
    // The package-internal bridge accepts only a successfully prepared view
    // from OfflineProposalManifest and rechecks its retained source hash.
    const document = retainedOfflineProposalDocument(this.#manifest);
    const manifest = record(document.parse(MAX_GRANT_BYTES));
    if (manifest.surface_hash !== this.#manifest.surfaceHash)
      throw new Error('manifest_binding_mismatch');
    return manifest;
  }

  #identityAdvertisement(manifest: JsonRecord): JsonRecord {
    const compatibility = fields(manifest.compatibility, [
      'min_runtime',
      'schema_dialect',
      'agent_identity_evidence_profiles',
    ]);
    const profiles = boundedArray(
      compatibility.agent_identity_evidence_profiles,
      'grant_manifest_binding',
    );
    if (profiles.length !== 1) throw new Error('grant_manifest_binding');
    return fields(profiles[0], [
      'profile',
      'format_profile',
      'artifact_digest_profile',
      'verification_profiles',
      'key_binding_profiles',
      'freshness_profiles',
      'status_profiles',
      'migration_profiles',
      'max_artifact_bytes',
    ]);
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

    const action = this.#manifestAction(manifest);
    const scope = this.#manifestScope(manifest);
    const api = fields(manifest.agent_api, [
      'credential_audience',
      'grant_introspection_url',
      'grant_revocation_url',
      'action_url',
      'session_control_url',
      'event_subscription_url',
      'event_delivery',
    ]);
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

  #manifestAction(
    manifest: JsonRecord,
  ): JsonRecord & { id: string; scope: string } {
    const actions = boundedArray(manifest.actions, 'grant_manifest_binding');
    if (actions.length !== 1) throw new Error('grant_manifest_binding');
    const action = fields(actions[0], [
      'id',
      'scope',
      'risk',
      'side_effect',
      'approval',
      'execution',
      'input_schema',
      'input_schema_hash',
      'output_schema',
      'data_exposure',
    ]);
    const id = identifier(action.id, 'grant_manifest_binding');
    if (id !== this.#manifest.actionId)
      throw new Error('grant_manifest_binding');
    return {
      ...action,
      id,
      scope: identifier(action.scope, 'grant_manifest_binding'),
    };
  }

  #manifestScope(manifest: JsonRecord): { id: string } {
    const scopes = boundedArray(manifest.scopes, 'grant_manifest_binding');
    if (scopes.length !== 1) throw new Error('grant_manifest_binding');
    const scope = fields(scopes[0], ['id', 'description']);
    return { id: identifier(scope.id, 'grant_manifest_binding') };
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

function projectExposure(
  manifest: JsonRecord,
  selectedAction: string,
  selectedScope: string,
): JsonRecord[] {
  const sources: Array<{
    kind: SourceKind;
    id: string;
    exposure: unknown;
  }> = [];
  const add = (kind: SourceKind, value: unknown): void => {
    const source = record(value);
    const id = identifier(source.id, 'grant_manifest_binding');
    if (!Object.hasOwn(source, 'data_exposure'))
      throw new Error('grant_manifest_binding');
    sources.push({ kind, id, exposure: source.data_exposure });
  };

  for (const resource of boundedArray(
    manifest.resources,
    'grant_manifest_binding',
  )) {
    const source = record(resource);
    if (!Object.hasOwn(source, 'id') || !Object.hasOwn(source, 'data_exposure'))
      throw new Error('grant_manifest_binding');
    if (source.read_scope === selectedScope) add('resource', source);
  }
  for (const action of boundedArray(
    manifest.actions,
    'grant_manifest_binding',
  )) {
    const source = record(action);
    if (source.id === selectedAction) add('action', source);
  }
  for (const event of boundedArray(manifest.events, 'grant_manifest_binding')) {
    const source = fields(
      event,
      ['id', 'data_exposure'],
      ['scope', 'control', 'schema'],
    );
    if (
      source.control === true ||
      (source.control !== true && source.scope === selectedScope)
    )
      add('event', source);
  }

  sources.sort((left, right) => {
    const kindOrder: Record<SourceKind, number> = {
      resource: 0,
      action: 1,
      event: 2,
    };
    const byKind = kindOrder[left.kind] - kindOrder[right.kind];
    return byKind === 0 ? compareCodePoints(left.id, right.id) : byKind;
  });

  const seen = new Set<string>();
  return sources.map(({ kind, id, exposure }) => {
    const key = `${kind}\u0000${id}`;
    if (seen.has(key)) throw new Error('grant_manifest_binding');
    seen.add(key);
    return {
      source: { kind, id },
      ...cloneRecord(exposure),
    };
  });
}

function validateIdentityEvidence(
  value: JsonRecord,
  advertisement: JsonRecord,
): void {
  const evidence = fields(value, IDENTITY_FIELDS, ['artifact_ref']);
  exactText(evidence.profile, IDENTITY_PROFILE);
  exactText(evidence.format_profile, PASSPORT_FORMAT_PROFILE);

  const digest = fields(evidence.artifact_digest, ['profile', 'value']);
  exactText(digest.profile, advertisement.artifact_digest_profile as string);
  if (!isDigest(digest.value)) incompatible();

  identifier(evidence.issuer, 'grant_identity_invalid');
  identifier(evidence.subject, 'grant_identity_invalid');
  profileInAdvertisement(
    evidence.verification_profile,
    advertisement.verification_profiles,
  );

  const keyBinding = fields(evidence.key_binding, ['profile', 'value']);
  profileInAdvertisement(
    keyBinding.profile,
    advertisement.key_binding_profiles,
  );
  if (!isDigest(keyBinding.value)) incompatible();

  const lifecycle = fields(evidence.lifecycle, [
    'freshness_profile',
    'status_profile',
    'status_ref',
  ]);
  profileInAdvertisement(
    lifecycle.freshness_profile,
    advertisement.freshness_profiles,
  );
  profileInAdvertisement(
    lifecycle.status_profile,
    advertisement.status_profiles,
  );
  identifier(lifecycle.status_ref, 'grant_identity_invalid');
  if (Object.hasOwn(evidence, 'artifact_ref'))
    identifier(evidence.artifact_ref, 'grant_identity_invalid');
}

function profileInAdvertisement(value: unknown, advertised: unknown): void {
  const profile = identifier(value, 'grant_identity_invalid');
  const profiles = boundedArray(advertised, 'grant_identity_invalid');
  if (profiles.some((candidate) => typeof candidate !== 'string'))
    throw new Error('grant_identity_invalid');
  if (!profiles.includes(profile)) throw new Error('grant_identity_mismatch');
}

function rfc3339(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (match === null) return false;
  const [, year, month, day, hour, minute, second, , zone] = match;
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined ||
    zone === undefined
  )
    return false;
  const monthValue = Number(month);
  const dayValue = Number(day);
  const hourValue = Number(hour);
  const minuteValue = Number(minute);
  const secondValue = Number(second);
  const zoneMatch = zone === 'Z' ? null : /[+-](\d{2}):(\d{2})/.exec(zone);
  if (
    monthValue < 1 ||
    monthValue > 12 ||
    dayValue < 1 ||
    dayValue > daysInMonth(Number(year), monthValue) ||
    hourValue > 23 ||
    minuteValue > 59 ||
    secondValue > 59 ||
    (zoneMatch !== null &&
      (Number(zoneMatch[1]) > 23 || Number(zoneMatch[2]) > 59))
  )
    return false;
  // This intentionally checks representation only. An expired timestamp is
  // valid here; trusted clock and authority state belong to later behavior.
  return Number.isFinite(Date.parse(value));
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
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
  return typeof value === 'string' && /^sha-256:[A-Za-z0-9_-]{43}$/.test(value);
}

function incompatible(): never {
  throw new Error('grant_incompatible');
}

function structurallyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    return (
      left.length === right.length &&
      left.every((value, index) => structurallyEqual(value, right[index]))
    );
  }
  if (
    typeof left !== 'object' ||
    left === null ||
    typeof right !== 'object' ||
    right === null
  )
    return false;
  const leftRecord = left as JsonRecord;
  const rightRecord = right as JsonRecord;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key) =>
      Object.hasOwn(rightRecord, key) &&
      structurallyEqual(leftRecord[key], rightRecord[key]),
  );
}

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const b = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return a.length - b.length;
}

function cloneRecord(value: unknown): JsonRecord {
  const source = record(value);
  const clone: JsonRecord = {};
  for (const [key, member] of Object.entries(source)) {
    clone[key] = cloneValue(member);
  }
  return clone;
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((member) => cloneValue(member));
  if (typeof value === 'object' && value !== null) return cloneRecord(value);
  return value;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  Object.freeze(value);
  for (const member of Object.values(value as object)) deepFreeze(member);
  return value;
}
