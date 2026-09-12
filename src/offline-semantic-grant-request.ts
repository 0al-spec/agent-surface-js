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
const GRANT_REQUEST_HASH_DOMAIN = `${ASP}hash/grant-request/v1`;

const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_IDENTIFIER_UNITS = 256;
const MAX_ARRAY_ENTRIES = 256;

const REQUEST_FIELDS = [
  'locations',
  'actions',
  'delegate',
  'resource_server',
  'scopes',
  'constraints',
  'credential_profile',
  'audit',
] as const;

/** Host-supplied integrity facts; these values are not authentication. */
export interface OfflineSemanticGrantRequestExpectations {
  readonly runtimeId: string;
  readonly agentId: string;
  readonly identityEvidence: JsonDocument;
}

/** A retained semantic request with behavior, not a request DTO. */
export interface PreparedOfflineSemanticGrantRequest {
  /** Recomputes the complete semantic request hash. */
  validate(): void;
  /** Returns the ASP grant-request/v1 hash of the complete request. */
  hash(): string;
  /** Returns a fresh immutable manifest-derived exposure projection. */
  dataExposure(): JsonDocument;
}

/**
 * Bounded offline validation of one candidate-specific semantic Grant request.
 *
 * This direct validator accepts the semantic hashing view rather than an RFC
 * 9396 authorization-details object. It validates representation, exact
 * bindings and the requested profile, but does not authenticate a caller,
 * approve or submit the request, issue a Grant, or consult authority state.
 */
export class OfflineSemanticGrantRequest {
  readonly #request: JsonDocument;
  readonly #manifest: PreparedOfflineProposalManifest;
  readonly #runtimeId: string;
  readonly #agentId: string;
  readonly #identityEvidence: JsonDocument;
  #prepared: PreparedOfflineSemanticGrantRequest | undefined;

  constructor(
    request: JsonDocument,
    manifest: PreparedOfflineProposalManifest,
    expectations: OfflineSemanticGrantRequestExpectations,
  ) {
    // Capture immutable values and dependencies only. Parsing and validation
    // are deliberately deferred to prepare().
    this.#request = request;
    this.#manifest = manifest;
    this.#runtimeId = expectations.runtimeId;
    this.#agentId = expectations.agentId;
    this.#identityEvidence = expectations.identityEvidence;
  }

  /** Validates once and retains a behavior-rich immutable view. */
  prepare(): PreparedOfflineSemanticGrantRequest {
    if (this.#prepared !== undefined) return this.#prepared;
    if (!(this.#request instanceof JsonDocument))
      throw new Error('invalid_grant_request_document');
    if (!(this.#identityEvidence instanceof JsonDocument))
      throw new Error('invalid_identity_metadata');

    const request = this.#parseRequest();
    const manifest = retainedProposalManifest(
      this.#manifest,
      MAX_REQUEST_BYTES,
      'grant_request_manifest_binding_mismatch',
    );
    const advertisement = identityAdvertisement(
      manifest,
      'grant_request_manifest_binding',
    );
    const expectedIdentity = this.#parseIdentity(this.#identityEvidence);
    validateIdentityEvidence(expectedIdentity, advertisement, IDENTITY_ERRORS);

    const projection = this.#validateRequest(
      request,
      manifest,
      advertisement,
      expectedIdentity,
    );
    const computed = grantRequestHash(this.#request);
    const retained = new RetainedOfflineSemanticGrantRequest(
      this.#request,
      computed,
      projection,
    );
    this.#prepared = retained;
    return retained;
  }

  /** Explicit validation entry point; successful validation returns the view. */
  validate(): PreparedOfflineSemanticGrantRequest {
    return this.prepare();
  }

  #parseRequest(): JsonRecord {
    try {
      return record(this.#request.parse(MAX_REQUEST_BYTES));
    } catch (error) {
      if (error instanceof Error && error.message === 'json_byte_limit')
        throw new Error('grant_request_byte_limit');
      throw error;
    }
  }

  #parseIdentity(document: JsonDocument): JsonRecord {
    try {
      return record(document.parse(MAX_REQUEST_BYTES));
    } catch (error) {
      if (error instanceof Error && error.message === 'json_byte_limit')
        throw new Error('identity_metadata_byte_limit');
      throw error;
    }
  }

  #validateRequest(
    request: JsonRecord,
    manifest: JsonRecord,
    advertisement: JsonRecord,
    expectedIdentity: JsonRecord,
  ): JsonRecord[] {
    fields(request, REQUEST_FIELDS, 'grant_request_incompatible');

    const action = manifestAction(
      manifest,
      this.#manifest.actionId,
      'grant_request_manifest_binding',
    );
    const scope = manifestScope(manifest, 'grant_request_manifest_binding');
    const api = manifestApi(manifest, 'grant_request_manifest_binding');

    const delegate = fields(
      request.delegate,
      ['runtime', 'agent', 'identity_evidence'],
      'grant_request_incompatible',
    );
    if (
      identifier(delegate.runtime, 'grant_request_incompatible') !==
      this.#runtimeId
    )
      throw new Error('grant_request_binding_mismatch');
    if (
      identifier(delegate.agent, 'grant_request_incompatible') !== this.#agentId
    )
      throw new Error('grant_request_binding_mismatch');

    const identityEvidence = record(delegate.identity_evidence);
    validateIdentityEvidence(identityEvidence, advertisement, IDENTITY_ERRORS);
    if (!structurallyEqual(identityEvidence, expectedIdentity))
      throw new Error('grant_request_identity_mismatch');

    const resourceServer = fields(
      request.resource_server,
      ['app_id', 'issuer', 'surface_version', 'surface_hash'],
      'grant_request_incompatible',
    );
    const manifestApp = identifier(
      manifest.app_id,
      'grant_request_manifest_binding',
    );
    const manifestIssuer = identifier(
      manifest.issuer,
      'grant_request_manifest_binding',
    );
    const manifestVersion = identifier(
      manifest.surface_version,
      'grant_request_manifest_binding',
    );
    const manifestSurfaceHash = identifier(
      manifest.surface_hash,
      'grant_request_manifest_binding',
    );
    if (
      resourceServer.app_id !== manifestApp ||
      resourceServer.issuer !== manifestIssuer ||
      resourceServer.surface_version !== manifestVersion ||
      resourceServer.surface_hash !== manifestSurfaceHash
    )
      throw new Error('grant_request_binding_mismatch');

    this.#exactSingletonList(request.locations, api.action_url, 'locations');
    this.#exactSingletonList(request.actions, action.id, 'actions');
    this.#exactSingletonList(request.scopes, scope.id, 'scopes');

    exactText(request.credential_profile, 'compatibility_bearer');
    this.#constraints(request.constraints);
    this.#audit(request.audit);

    return projectExposure(
      manifest,
      action.id,
      scope.id,
      'grant_request_manifest_binding',
    );
  }

  #exactSingletonList(value: unknown, expected: unknown, name: string): void {
    const values = boundedArray(value, 'grant_request_incompatible');
    if (
      values.length !== 1 ||
      typeof values[0] !== 'string' ||
      values[0] !== expected
    )
      throw new Error(`grant_request_${name}_mismatch`);
  }

  #constraints(value: unknown): void {
    const constraints = fields(
      value,
      ['expires_at', 'credential_release'],
      'grant_request_incompatible',
    );
    if (!rfc3339(constraints.expires_at))
      throw new Error('grant_request_constraints_invalid');
    const release = fields(
      constraints.credential_release,
      ['mode'],
      'grant_request_incompatible',
    );
    exactText(release.mode, 'deny');
  }

  #audit(value: unknown): void {
    const audit = fields(
      value,
      ['local_receipt', 'app_receipt'],
      'grant_request_incompatible',
    );
    exactText(audit.local_receipt, 'required');
    exactText(audit.app_receipt, 'required');
  }
}

class RetainedOfflineSemanticGrantRequest
  implements PreparedOfflineSemanticGrantRequest
{
  readonly #request: JsonDocument;
  readonly #requestHash: string;
  readonly #projection: JsonRecord[];

  constructor(
    request: JsonDocument,
    requestHash: string,
    projection: JsonRecord[],
  ) {
    this.#request = request;
    this.#requestHash = requestHash;
    this.#projection = deepFreeze(projection);
    Object.freeze(this);
  }

  validate(): void {
    this.hash();
  }

  hash(): string {
    this.#request.parse(MAX_REQUEST_BYTES);
    const current = grantRequestHash(this.#request);
    if (current !== this.#requestHash)
      throw new Error('grant_request_hash_mismatch');
    return current;
  }

  dataExposure(): JsonDocument {
    return new JsonDocument(JSON.stringify(this.#projection));
  }
}

const IDENTITY_ERRORS = {
  incompatible: 'grant_request_incompatible',
  invalid: 'grant_request_identity_invalid',
  mismatch: 'grant_request_identity_mismatch',
} as const;

function grantRequestHash(request: JsonDocument): string {
  return new CanonicalObjectHash(GRANT_REQUEST_HASH_DOMAIN).digest(request);
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('grant_request_incompatible');
  return value as JsonRecord;
}

function fields(
  value: unknown,
  required: readonly string[],
  error: string,
): JsonRecord {
  const object = record(value);
  if (required.some((key) => !Object.hasOwn(object, key)))
    throw new Error(error);
  if (Object.keys(object).some((key) => !required.includes(key)))
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

function exactText(value: unknown, expected: string): void {
  if (value !== expected) throw new Error('grant_request_incompatible');
}
