import {
  type PreparedOfflineProposalManifest,
  retainedOfflineProposalDocument,
} from './offline-proposal-manifest.js';

const ASP = 'https://github.com/0al-spec/agent-surface/';
const IDENTITY_PROFILE = `${ASP}profiles/agent-identity-evidence/v1`;
const PASSPORT_FORMAT_PROFILE = `${ASP}profiles/agent-passport-minimal/v1`;
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
const AGENT_API_FIELDS = [
  'credential_audience',
  'grant_introspection_url',
  'grant_revocation_url',
  'action_url',
  'session_control_url',
  'event_subscription_url',
  'event_delivery',
] as const;
const ACTION_FIELDS = [
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
] as const;
const SCOPE_FIELDS = ['id', 'description'] as const;
const IDENTITY_ADVERTISEMENT_FIELDS = [
  'profile',
  'format_profile',
  'artifact_digest_profile',
  'verification_profiles',
  'key_binding_profiles',
  'freshness_profiles',
  'status_profiles',
  'migration_profiles',
  'max_artifact_bytes',
] as const;
const MAX_ARRAY_ENTRIES = 256;
const MAX_IDENTIFIER_UNITS = 256;

type JsonRecord = Record<string, unknown>;
type SourceKind = 'resource' | 'action' | 'event';

export interface IdentityValidationErrors {
  readonly incompatible: string;
  readonly invalid: string;
  readonly mismatch: string;
}

const DEFAULT_IDENTITY_ERRORS: IdentityValidationErrors = {
  incompatible: 'grant_incompatible',
  invalid: 'grant_identity_invalid',
  mismatch: 'grant_identity_mismatch',
};

/**
 * Reads the exact source document retained by a prepared proposal manifest.
 * The bridge rejects structural lookalikes and rechecks the retained hash.
 */
export function retainedProposalManifest(
  value: PreparedOfflineProposalManifest,
  maximumBytes: number,
  hashError = 'manifest_binding_mismatch',
): JsonRecord {
  const document = retainedOfflineProposalDocument(value);
  const manifest = record(document.parse(maximumBytes));
  if (manifest.surface_hash !== value.surfaceHash) throw new Error(hashError);
  return manifest;
}

export function identityAdvertisement(
  manifest: JsonRecord,
  error = 'grant_manifest_binding',
): JsonRecord {
  const compatibility = fields(
    manifest.compatibility,
    ['min_runtime', 'schema_dialect', 'agent_identity_evidence_profiles'],
    [],
    error,
  );
  const profiles = boundedArray(
    compatibility.agent_identity_evidence_profiles,
    error,
  );
  if (profiles.length !== 1) throw new Error(error);
  return fields(profiles[0], IDENTITY_ADVERTISEMENT_FIELDS, [], error);
}

export function manifestApi(
  manifest: JsonRecord,
  error = 'grant_manifest_binding',
): JsonRecord {
  return fields(manifest.agent_api, AGENT_API_FIELDS, [], error);
}

export function manifestAction(
  manifest: JsonRecord,
  selectedAction: string,
  error = 'grant_manifest_binding',
): JsonRecord & { id: string; scope: string } {
  const actions = boundedArray(manifest.actions, error);
  if (actions.length !== 1) throw new Error(error);
  const action = fields(actions[0], ACTION_FIELDS, [], error);
  const id = identifier(action.id, error);
  if (id !== selectedAction) throw new Error(error);
  return { ...action, id, scope: identifier(action.scope, error) };
}

export function manifestScope(
  manifest: JsonRecord,
  error = 'grant_manifest_binding',
): { id: string } {
  const scopes = boundedArray(manifest.scopes, error);
  if (scopes.length !== 1) throw new Error(error);
  const scope = fields(scopes[0], SCOPE_FIELDS, [], error);
  return { id: identifier(scope.id, error) };
}

/**
 * Validates the complete privacy-safe identity envelope against the one
 * advertised profile entry. The caller remains responsible for authenticating
 * the evidence; this function only checks representation and equality.
 */
export function validateIdentityEvidence(
  value: JsonRecord,
  advertisement: JsonRecord,
  errors: IdentityValidationErrors = DEFAULT_IDENTITY_ERRORS,
): void {
  const evidence = fields(
    value,
    IDENTITY_FIELDS,
    ['artifact_ref'],
    errors.incompatible,
  );
  exactText(evidence.profile, IDENTITY_PROFILE, errors.incompatible);
  exactText(
    evidence.format_profile,
    PASSPORT_FORMAT_PROFILE,
    errors.incompatible,
  );

  const digest = fields(
    evidence.artifact_digest,
    ['profile', 'value'],
    [],
    errors.incompatible,
  );
  exactText(
    digest.profile,
    advertisement.artifact_digest_profile as string,
    errors.incompatible,
  );
  if (!isDigest(digest.value)) throw new Error(errors.incompatible);

  identifier(evidence.issuer, errors.invalid);
  identifier(evidence.subject, errors.invalid);
  profileInAdvertisement(
    evidence.verification_profile,
    advertisement.verification_profiles,
    errors,
  );

  const keyBinding = fields(
    evidence.key_binding,
    ['profile', 'value'],
    [],
    errors.incompatible,
  );
  profileInAdvertisement(
    keyBinding.profile,
    advertisement.key_binding_profiles,
    errors,
  );
  if (!isDigest(keyBinding.value)) throw new Error(errors.incompatible);

  const lifecycle = fields(
    evidence.lifecycle,
    ['freshness_profile', 'status_profile', 'status_ref'],
    [],
    errors.incompatible,
  );
  profileInAdvertisement(
    lifecycle.freshness_profile,
    advertisement.freshness_profiles,
    errors,
  );
  profileInAdvertisement(
    lifecycle.status_profile,
    advertisement.status_profiles,
    errors,
  );
  identifier(lifecycle.status_ref, errors.invalid);
  if (Object.hasOwn(evidence, 'artifact_ref'))
    identifier(evidence.artifact_ref, errors.invalid);
}

function profileInAdvertisement(
  value: unknown,
  advertised: unknown,
  errors: IdentityValidationErrors,
): void {
  const profile = identifier(value, errors.invalid);
  const profiles = boundedArray(advertised, errors.invalid);
  if (profiles.some((candidate) => typeof candidate !== 'string'))
    throw new Error(errors.invalid);
  if (!profiles.includes(profile)) throw new Error(errors.mismatch);
}

/** Derives the exact ordered source closure for a selected proposal action. */
export function projectExposure(
  manifest: JsonRecord,
  selectedAction: string,
  selectedScope: string,
  error = 'grant_manifest_binding',
): JsonRecord[] {
  const sources: Array<{
    kind: SourceKind;
    id: string;
    exposure: unknown;
  }> = [];
  const add = (kind: SourceKind, value: unknown): void => {
    const source = record(value, error);
    const id = identifier(source.id, error);
    if (!Object.hasOwn(source, 'data_exposure')) throw new Error(error);
    sources.push({ kind, id, exposure: source.data_exposure });
  };

  for (const resource of boundedArray(manifest.resources, error)) {
    const source = record(resource, error);
    if (!Object.hasOwn(source, 'id') || !Object.hasOwn(source, 'data_exposure'))
      throw new Error(error);
    if (source.read_scope === selectedScope) add('resource', source);
  }
  for (const action of boundedArray(manifest.actions, error)) {
    const source = record(action, error);
    if (source.id === selectedAction) add('action', source);
  }
  for (const event of boundedArray(manifest.events, error)) {
    const source = fields(
      event,
      ['id', 'data_exposure'],
      ['scope', 'control', 'schema'],
      error,
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
    if (seen.has(key)) throw new Error(error);
    seen.add(key);
    return { source: { kind, id }, ...cloneRecord(exposure, error) };
  });
}

export function rfc3339(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i.exec(
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
  const zoneMatch =
    zone.toUpperCase() === 'Z' ? null : /[+-](\d{2}):(\d{2})/.exec(zone);
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
  // This checks representation only. Expiry decisions require a trusted clock
  // and authoritative issuer state, which are outside this offline layer.
  return Number.isFinite(Date.parse(value));
}

export function structurallyEqual(left: unknown, right: unknown): boolean {
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

export function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  Object.freeze(value);
  for (const member of Object.values(value as object)) deepFreeze(member);
  return value;
}

function record(
  value: unknown,
  error = 'manifest_object_required',
): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(error);
  return value as JsonRecord;
}

function fields(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  error: string,
): JsonRecord {
  const object = record(value, error);
  if (required.some((key) => !Object.hasOwn(object, key)))
    throw new Error(error);
  if (
    Object.keys(object).some(
      (key) => !required.includes(key) && !optional.includes(key),
    )
  )
    throw new Error(error);
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

function exactText(value: unknown, expected: string, error: string): void {
  if (value !== expected) throw new Error(error);
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

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const b = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return a.length - b.length;
}

function cloneRecord(value: unknown, error: string): JsonRecord {
  const source = record(value, error);
  const clone: JsonRecord = {};
  for (const [key, member] of Object.entries(source)) {
    clone[key] = cloneValue(member, error);
  }
  return clone;
}

function cloneValue(value: unknown, error: string): unknown {
  if (Array.isArray(value))
    return value.map((member) => cloneValue(member, error));
  if (typeof value === 'object' && value !== null)
    return cloneRecord(value, error);
  return value;
}
