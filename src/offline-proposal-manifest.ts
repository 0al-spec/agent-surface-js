import { JsonDocument } from './json-document.js';
import { ManifestExposureDeclarations } from './manifest-exposure-declarations.js';
import {
  OfflineSchemaResources,
  type PreparedSchema,
} from './offline-schema-resources.js';
import { SurfaceSnapshot } from './surface-snapshot.js';

const PROTOCOL = 'agent-surface/0.1';
const DIALECT = 'https://json-schema.org/draft/2020-12/schema';
const ASP_ROOT = 'https://github.com/0al-spec/agent-surface/';
const IDENTITY_PROFILE = `${ASP_ROOT}profiles/agent-identity-evidence/v1`;
const PASSPORT_FORMAT_PROFILE = `${ASP_ROOT}profiles/agent-passport-minimal/v1`;
const PASSPORT_DIGEST_PROFILE = `${ASP_ROOT}hash/agent-passport-artifact/v1`;
const CONTROL_EVENT = 'grant.revoked';
const RECEIPT_HASH_PROFILE = 'asp-jcs-sha-256';
const EVENT_DELIVERY_PROFILE = 'at_least_once';

const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_DATA_CLASSES = 256;
const MAX_PROFILE_ENTRIES = 1;
const MAX_PROFILE_IDENTIFIERS = 8;
const MAX_ARTIFACT_BYTES = 262_144;
const MAX_RECEIPT_FIELDS = 64;
const MAX_EVENT_DELIVERY_VALUE = 1_000_000;

const REQUIRED_TOP_LEVEL = [
  'protocol',
  'app_id',
  'issuer',
  'surface_mode',
  'surface_version',
  'surface_hash',
  'surface_url',
  'compatibility',
  'auth',
  'agent_api',
  'scopes',
  'data_classes',
  'resources',
  'actions',
  'events',
  'audit',
  'revocation',
] as const;

const REQUIRED_COMPATIBILITY = [
  'min_runtime',
  'schema_dialect',
  'agent_identity_evidence_profiles',
] as const;

const REQUIRED_AGENT_API = [
  'credential_audience',
  'grant_introspection_url',
  'grant_revocation_url',
  'action_url',
  'session_control_url',
  'event_subscription_url',
  'event_delivery',
] as const;

const REQUIRED_AUDIT = [
  'hash_profile',
  'receipt_schema',
  'required_fields',
] as const;

const REQUIRED_REVOCATION = [
  'grant_management_url',
  'grant_revocation_url',
  'event',
] as const;

const REQUIRED_SCOPE = ['id', 'description'] as const;
const REQUIRED_DATA_CLASS = [
  'id',
  'classification',
  'label',
  'description',
] as const;
const REQUIRED_ACTION = [
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
const REQUIRED_EXECUTION = ['mode', 'operation_id'] as const;
const REQUIRED_EVENT = ['id', 'control', 'schema', 'data_exposure'] as const;
const REQUIRED_IDENTITY_ENTRY = [
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
const REQUIRED_EVENT_DELIVERY = [
  'profile',
  'ack_deadline_seconds',
  'max_in_flight',
  'retention_seconds',
] as const;

// Selected SDK advertisement minimum, using Core's example field names.
// It deliberately includes conditional execution fields. This field-name
// check does not implement Evidence's conditional receipt semantics.
const REQUIRED_RECEIPT_FIELDS = new Set([
  'receipt_id',
  'receipt_type',
  'receipt_hash',
  'grant_id',
  'grant_hash',
  'session_id',
  'session_generation',
  'trace_id',
  'span_id',
  'action_id',
  'app_id',
  'surface_version',
  'surface_hash',
  'runtime',
  'actor_agent',
  'subject',
  'idempotency_key',
  'input_hash',
  'execution',
  'execution_hash',
  'policy_decision',
  'policy_decision_hash',
  'timestamp',
  'result',
]);

const KNOWN_RECEIPT_FIELDS = new Set([
  ...REQUIRED_RECEIPT_FIELDS,
  'parent_trace_id',
  'producer_span_id',
  'agent_passport_hash',
  'identity_evidence_hash',
  'preconditions_hash',
  'expected_effects_hash',
  'reservation_id',
  'reservation_result',
  'target_receipt_hash',
  'revert_evidence',
  'output_hash',
  'actual_effects',
  'actual_effects_hash',
  'effect_outcome',
  'approval_reference',
  'approval_receipt_hashes',
  'budget_charges',
  'error',
  'error_classification',
]);

type JsonRecord = Record<string, unknown>;
const preparedOfflineProposalValues = new WeakSet<object>();

/**
 * A retained, representation-only view of one selected proposal action.
 *
 * This object validates schemas on every call. It never issues credentials,
 * authenticates discovery, verifies identity status, proves consent, admits a
 * Grant, runs a handler, or claims that an exposure contract is enforced.
 */
export interface PreparedOfflineProposalManifest {
  readonly document: JsonDocument;
  readonly surfaceHash: string;
  readonly actionId: string;
  hash(): string;
  validateInput(actionId: string, document: JsonDocument): void;
  validateOutput(actionId: string, document: JsonDocument): void;
}

/**
 * Bounded offline validation for one host-provisioned, proposal-only
 * manifest. This is a static declaration check, not a complete ASP runtime.
 * Construction captures dependencies only; parsing and validation happen in
 * prepare().
 */
export class OfflineProposalManifest {
  readonly #document: JsonDocument;
  readonly #resources: OfflineSchemaResources;
  readonly #expectedIdentityEntry: JsonDocument;
  #prepared: PreparedOfflineProposalManifest | undefined;

  constructor(
    document: JsonDocument,
    resources: OfflineSchemaResources,
    expectedIdentityEntry: JsonDocument,
  ) {
    this.#document = document;
    this.#resources = resources;
    this.#expectedIdentityEntry = expectedIdentityEntry;
  }

  /** Validates and retains the exact original document and selected schemas. */
  prepare(): PreparedOfflineProposalManifest {
    if (this.#prepared !== undefined) return this.#prepared;
    if (!(this.#document instanceof JsonDocument))
      throw new Error('invalid_manifest_document');
    if (!(this.#resources instanceof OfflineSchemaResources))
      throw new Error('invalid_schema_resources');
    if (!(this.#expectedIdentityEntry instanceof JsonDocument))
      throw new Error('invalid_identity_advertisement');

    const parsed = this.#parseManifest();
    const supplied = parsed.surface_hash;
    if (typeof supplied !== 'string') throw new Error('surface_hash_required');

    // SurfaceSnapshot remains the generic content-integrity primitive. This
    // path adds the selected manifest's required supplied-hash precondition.
    const computedHash = new SurfaceSnapshot(this.#document).hash();
    if (supplied !== computedHash) throw new Error('surface_hash_mismatch');

    const declaration = this.#validateManifest(parsed);
    // Exposure validation intentionally runs against the complete original
    // bytes before any selected member is retained.
    new ManifestExposureDeclarations(this.#document).validate();

    const preparedSchemas = this.#resources.prepare();
    const inputSchema = preparedSchemas.resolveInput(
      declaration.action.input_schema,
      declaration.action.input_schema_hash,
    );
    const outputSchema = preparedSchemas.resolve(
      declaration.action.output_schema,
    );
    // Event and receipt schemas are retained as prepared immutable resources,
    // even though this representation-only object does not produce events or
    // receipts. Their references may not dangle after preparation.
    const eventSchema = preparedSchemas.resolve(declaration.eventSchema);
    const receiptSchema = preparedSchemas.resolve(declaration.receiptSchema);

    const retained = new RetainedOfflineProposalManifest(
      this.#document,
      computedHash,
      declaration.action.id,
      inputSchema,
      outputSchema,
      eventSchema,
      receiptSchema,
    );
    preparedOfflineProposalValues.add(retained);
    this.#prepared = retained;
    return retained;
  }

  #parseManifest(): JsonRecord {
    let parsed: unknown;
    try {
      parsed = this.#document.parse(MAX_MANIFEST_BYTES);
    } catch (error) {
      if (error instanceof Error && error.message === 'json_byte_limit') {
        throw new Error('manifest_byte_limit');
      }
      throw error;
    }
    return record(parsed);
  }

  #validateManifest(manifest: JsonRecord): SelectedDeclaration {
    fields(manifest, REQUIRED_TOP_LEVEL);
    exactText(manifest.protocol, PROTOCOL);
    identifier(manifest.app_id);
    const issuer = httpsUrl(manifest.issuer, false);
    identifier(manifest.surface_version);
    exactText(manifest.surface_mode, 'proposal_only');
    digest(manifest.surface_hash);
    const surfaceUrl = httpsUrl(manifest.surface_url, true);
    if (surfaceUrl.origin !== issuer.origin) incompatible();

    this.#compatibility(manifest.compatibility);
    this.#auth(manifest.auth);
    const paths = this.#agentApi(manifest.agent_api, issuer.origin);
    this.#scopes(manifest.scopes);
    this.#dataClasses(manifest.data_classes);
    if (!Array.isArray(manifest.resources)) incompatible();
    if (manifest.resources.length !== 0)
      throw new Error('resource_inventory_unsupported');
    const action = this.#action(manifest);
    const eventSchema = this.#events(manifest.events);
    const receiptSchema = this.#audit(manifest.audit, issuer.origin);
    const management = this.#revocation(
      manifest.revocation,
      issuer.origin,
      paths.revocation,
    );

    if (paths.actionPath === surfaceUrl.pathname) incompatible();
    const allPaths = new Set([
      surfaceUrl.pathname,
      ...paths.routes,
      new URL(management).pathname,
    ]);
    if (allPaths.size !== paths.routes.length + 2) incompatible();
    if (
      paths.audience.origin === issuer.origin &&
      allPaths.has(paths.audience.pathname)
    ) {
      incompatible();
    }
    if (action.scope !== this.#scopeId(manifest.scopes)) incompatible();
    return { action, eventSchema, receiptSchema };
  }

  #compatibility(value: unknown): void {
    const compatibility = fields(value, REQUIRED_COMPATIBILITY);
    identifier(compatibility.min_runtime);
    exactText(compatibility.schema_dialect, DIALECT);
    const profiles = array(
      compatibility.agent_identity_evidence_profiles,
      'identity_profile_count_limit',
    );
    if (profiles.length !== MAX_PROFILE_ENTRIES)
      throw new Error('identity_profile_count_limit');
    const [entry] = profiles;
    this.#identityEntry(entry);
    const expected = record(
      this.#expectedIdentityEntry.parse(MAX_MANIFEST_BYTES),
    );
    this.#identityEntry(expected);
    if (!structurallyEqual(entry, expected))
      throw new Error('identity_profile_mismatch');
  }

  #identityEntry(value: unknown): void {
    const entry = fields(value, REQUIRED_IDENTITY_ENTRY);
    exactText(entry.profile, IDENTITY_PROFILE);
    exactText(entry.format_profile, PASSPORT_FORMAT_PROFILE);
    exactText(entry.artifact_digest_profile, PASSPORT_DIGEST_PROFILE);
    this.#profileIdentifiers(entry.verification_profiles, true);
    this.#profileIdentifiers(entry.key_binding_profiles, true);
    this.#profileIdentifiers(entry.freshness_profiles, true);
    this.#profileIdentifiers(entry.status_profiles, true);
    this.#profileIdentifiers(entry.migration_profiles, false);
    if (
      !Number.isSafeInteger(entry.max_artifact_bytes) ||
      Number(entry.max_artifact_bytes) <= 0 ||
      Number(entry.max_artifact_bytes) > MAX_ARTIFACT_BYTES
    ) {
      throw new Error('identity_artifact_byte_limit');
    }
  }

  #profileIdentifiers(value: unknown, required: boolean): void {
    const profiles = array(value, 'identity_profile_identifier_limit');
    if (profiles.length > MAX_PROFILE_IDENTIFIERS)
      throw new Error('identity_profile_identifier_limit');
    if (required && profiles.length === 0)
      throw new Error('identity_profile_required');
    const seen = new Set<string>();
    for (const profile of profiles) {
      const id = profileIdentifier(profile);
      if (seen.has(id)) throw new Error('identity_profile_duplicate');
      seen.add(id);
    }
  }

  #auth(value: unknown): void {
    const auth = fields(value, ['type', 'credential_profile'] as const);
    exactText(auth.type, `${ASP_ROOT}profiles/host-provisioned-bearer/v1`);
    exactText(auth.credential_profile, 'compatibility_bearer');
  }

  #agentApi(
    value: unknown,
    issuerOrigin: string,
  ): {
    audience: URL;
    introspection: string;
    revocation: string;
    actionPath: string;
    routes: string[];
  } {
    const api = fields(value, REQUIRED_AGENT_API);
    const audience = httpsUrl(api.credential_audience, true);
    const introspection = endpoint(api.grant_introspection_url, issuerOrigin);
    const revocation = endpoint(api.grant_revocation_url, issuerOrigin);
    const action = endpoint(api.action_url, issuerOrigin);
    const session = endpoint(api.session_control_url, issuerOrigin);
    const event = endpoint(api.event_subscription_url, issuerOrigin);
    const delivery = fields(api.event_delivery, REQUIRED_EVENT_DELIVERY);
    exactText(delivery.profile, EVENT_DELIVERY_PROFILE);
    for (const key of [
      'ack_deadline_seconds',
      'max_in_flight',
      'retention_seconds',
    ]) {
      positiveBoundedInteger(delivery[key], MAX_EVENT_DELIVERY_VALUE);
    }
    if (
      audience.origin === issuerOrigin &&
      audience.pathname === new URL(action).pathname
    )
      incompatible();
    return {
      audience,
      introspection,
      revocation,
      actionPath: new URL(action).pathname,
      routes: [introspection, revocation, action, session, event].map(
        (route) => new URL(route).pathname,
      ),
    };
  }

  #scopes(value: unknown): void {
    const scopes = array(value, 'scope_count_limit');
    if (scopes.length !== 1) throw new Error('scope_count_limit');
    const scope = fields(scopes[0], REQUIRED_SCOPE);
    identifier(scope.id);
    identifier(scope.description);
  }

  #scopeId(value: unknown): string {
    const scopes = array(value, 'scope_count_limit');
    const scope = fields(scopes[0], REQUIRED_SCOPE);
    return identifier(scope.id);
  }

  #dataClasses(value: unknown): void {
    const classes = array(value, 'data_class_count_limit');
    if (classes.length > MAX_DATA_CLASSES)
      throw new Error('data_class_count_limit');
    for (const item of classes) {
      const dataClass = fields(item, REQUIRED_DATA_CLASS);
      identifier(dataClass.id);
      if (
        dataClass.classification !== 'public' &&
        dataClass.classification !== 'private' &&
        dataClass.classification !== 'sensitive' &&
        dataClass.classification !== 'credential'
      )
        incompatible();
      identifier(dataClass.label);
      identifier(dataClass.description);
    }
  }

  #action(manifest: JsonRecord): {
    id: string;
    scope: string;
    input_schema: string;
    input_schema_hash: string;
    output_schema: string;
  } {
    const actions = array(manifest.actions, 'action_count_limit');
    if (actions.length !== 1) throw new Error('action_count_limit');
    const action = fields(actions[0], REQUIRED_ACTION, []);
    const id = identifier(action.id);
    const scope = identifier(action.scope);
    exactText(action.risk, 'propose');
    if (action.side_effect !== false) incompatible();
    exactText(action.approval, 'none');
    const execution = fields(action.execution, REQUIRED_EXECUTION, [
      'persisted',
    ]);
    exactText(execution.mode, 'propose');
    identifier(execution.operation_id);
    if (Object.hasOwn(execution, 'persisted') && execution.persisted !== false)
      incompatible();
    const inputSchema = schemaUri(action.input_schema);
    const outputSchema = schemaUri(action.output_schema);
    const inputHash = digest(action.input_schema_hash);
    return {
      id,
      scope,
      input_schema: inputSchema,
      input_schema_hash: inputHash,
      output_schema: outputSchema,
    };
  }

  #events(value: unknown): string {
    const events = array(value, 'control_event_count_limit');
    // grant.revoked is required by the selected revocation/event binding. No
    // budget controls are implied because this subset publishes no budget.
    if (events.length !== 1) throw new Error('control_event_count_limit');
    const event = fields(events[0], REQUIRED_EVENT, []);
    exactText(event.id, CONTROL_EVENT);
    if (event.control !== true) incompatible();
    const schema = schemaUri(event.schema);
    if (Object.hasOwn(event, 'scope')) incompatible();
    return schema;
  }

  #audit(value: unknown, issuerOrigin: string): string {
    const audit = fields(value, REQUIRED_AUDIT);
    exactText(audit.hash_profile, RECEIPT_HASH_PROFILE);
    const receiptSchema = httpsUrl(audit.receipt_schema, false);
    if (receiptSchema.origin !== issuerOrigin) incompatible();
    const required = array(
      audit.required_fields,
      'audit_required_fields_limit',
    );
    if (required.length > MAX_RECEIPT_FIELDS)
      throw new Error('audit_required_fields_limit');
    const seen = new Set<string>();
    for (const field of required) {
      const name = identifier(field);
      if (seen.has(name)) throw new Error('audit_required_field_duplicate');
      if (!KNOWN_RECEIPT_FIELDS.has(name)) incompatible();
      seen.add(name);
    }
    for (const field of REQUIRED_RECEIPT_FIELDS) {
      if (!seen.has(field)) throw new Error('audit_required_field_missing');
    }
    return identifier(audit.receipt_schema);
  }

  #revocation(
    value: unknown,
    issuerOrigin: string,
    apiRevocation: string,
  ): string {
    const revocation = fields(value, REQUIRED_REVOCATION);
    const management = endpoint(revocation.grant_management_url, issuerOrigin);
    const selected = endpoint(revocation.grant_revocation_url, issuerOrigin);
    if (selected !== apiRevocation) incompatible();
    exactText(revocation.event, CONTROL_EVENT);
    if (new URL(management).pathname === new URL(apiRevocation).pathname)
      incompatible();
    return management;
  }
}

/** Package-internal bridge; deliberately not exported from the package index. */
export function retainedOfflineProposalDocument(
  value: PreparedOfflineProposalManifest,
): JsonDocument {
  if (
    typeof value !== 'object' ||
    value === null ||
    !preparedOfflineProposalValues.has(value)
  ) {
    throw new Error('invalid_manifest_binding');
  }
  value.hash();
  return value.document;
}

interface SelectedDeclaration {
  readonly action: {
    id: string;
    scope: string;
    input_schema: string;
    input_schema_hash: string;
    output_schema: string;
  };
  readonly eventSchema: string;
  readonly receiptSchema: string;
}

class RetainedOfflineProposalManifest
  implements PreparedOfflineProposalManifest
{
  readonly #document: JsonDocument;
  readonly #surfaceHash: string;
  readonly #actionId: string;
  readonly #inputSchema: PreparedSchema;
  readonly #outputSchema: PreparedSchema;
  readonly #eventSchema: PreparedSchema;
  readonly #receiptSchema: PreparedSchema;

  constructor(
    document: JsonDocument,
    surfaceHash: string,
    actionId: string,
    inputSchema: PreparedSchema,
    outputSchema: PreparedSchema,
    eventSchema: PreparedSchema,
    receiptSchema: PreparedSchema,
  ) {
    this.#document = document;
    this.#surfaceHash = surfaceHash;
    this.#actionId = actionId;
    this.#inputSchema = inputSchema;
    this.#outputSchema = outputSchema;
    this.#eventSchema = eventSchema;
    this.#receiptSchema = receiptSchema;
    Object.freeze(this);
  }

  get document(): JsonDocument {
    return this.#document;
  }

  get surfaceHash(): string {
    return this.#surfaceHash;
  }

  get actionId(): string {
    return this.#actionId;
  }

  hash(): string {
    // Keep the control-event and receipt schema preparations reachable from
    // the retained view even though this slice exposes only action validation.
    void this.#eventSchema;
    void this.#receiptSchema;
    const current = new SurfaceSnapshot(this.#document).hash();
    if (current !== this.#surfaceHash) throw new Error('surface_hash_mismatch');
    return current;
  }

  validateInput(actionId: string, document: JsonDocument): void {
    this.#action(actionId);
    this.#inputSchema.validate(document);
  }

  validateOutput(actionId: string, document: JsonDocument): void {
    this.#action(actionId);
    this.#outputSchema.validate(document);
  }

  #action(actionId: string): void {
    if (typeof actionId !== 'string' || actionId !== this.#actionId)
      throw new Error('action_unknown');
  }
}

function record(value: unknown): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('manifest_object_required');
  }
  return value as JsonRecord;
}

function fields(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): JsonRecord {
  const object = record(value);
  for (const key of required) {
    if (!Object.hasOwn(object, key)) incompatible();
  }
  for (const key of Object.keys(object)) {
    if (!required.includes(key) && !optional.includes(key)) incompatible();
  }
  return object;
}

function array(value: unknown, limitError: string): unknown[] {
  if (!Array.isArray(value)) incompatible();
  if (value.length > 256) throw new Error(limitError);
  return value;
}

function identifier(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) incompatible();
  return value;
}

function exactText(value: unknown, expected: string): void {
  if (value !== expected) incompatible();
}

function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^sha-256:[A-Za-z0-9_-]{43}$/.test(value))
    incompatible();
  return value;
}

function schemaUri(value: unknown): string {
  const text = identifier(value);
  httpsUrl(text, false);
  return text;
}

function profileIdentifier(value: unknown): string {
  const identifierValue = identifier(value);
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:[^\s]+$/.test(identifierValue)) incompatible();
  return identifierValue;
}

function httpsUrl(value: unknown, requirePath: boolean): URL {
  const text = identifier(value);
  if (
    text !== text.trim() ||
    Array.from(text).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 0x1f || code === 0x7f;
    })
  )
    incompatible();
  if (
    text.includes('?') ||
    text.includes('#') ||
    text.includes('\\') ||
    /%(?![0-9A-Fa-f]{2})/.test(text)
  )
    incompatible();
  // URL.pathname preserves escaped unreserved characters, although their
  // literal spellings are URI-equivalent. Reject rather than rewrite hashed
  // declarations so the later distinct-path check cannot miss such aliases.
  for (const encoded of text.match(/%[0-9A-Fa-f]{2}/g) ?? []) {
    const character = String.fromCharCode(
      Number.parseInt(encoded.slice(1), 16),
    );
    if (/^[A-Za-z0-9._~-]$/.test(character)) incompatible();
  }
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    incompatible();
  }
  // This slice retains the exact URL string and refuses spelling changes that
  // URL parsing would normalize (queries/fragments, dot segments, backslashes,
  // host case and default ports included). A bare issuer/schema origin may
  // omit the URL object's conventional trailing slash.
  const bareOriginWithoutSlash =
    !requirePath && parsed.pathname === '/' && parsed.href === `${text}/`;
  if (parsed.href !== text && !bareOriginWithoutSlash) incompatible();
  if (
    parsed.protocol !== 'https:' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    (requirePath && (parsed.pathname === '' || parsed.pathname === '/'))
  ) {
    incompatible();
  }
  return parsed;
}

function endpoint(value: unknown, issuerOrigin: string): string {
  const parsed = httpsUrl(value, true);
  if (parsed.origin !== issuerOrigin) incompatible();
  // Keep the exact declared string as the retained route identity. URL parsing
  // is only a static safety check; no URL normalization or aliasing is done.
  return identifier(value);
}

function positiveBoundedInteger(value: unknown, maximum: number): void {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) <= 0 ||
    Number(value) > maximum
  )
    incompatible();
}

function incompatible(): never {
  throw new Error('surface_incompatible');
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
