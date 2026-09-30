import { JsonDocument } from './json-document.js';
import type { PreparedOfflineProposalManifest } from './offline-proposal-manifest.js';
import {
  OfflineSelectedGrant,
  type OfflineSelectedGrantExpectations,
} from './offline-selected-grant.js';
import { OfflineSemanticGrantRequest } from './offline-semantic-grant-request.js';

const MAX_DOCUMENT_BYTES = 256 * 1024;

/**
 * Checks a complete semantic request and selected Grant against the same
 * retained manifest and host expectations, then checks expiry attenuation.
 * This is offline representation validation, not consent or Grant admission.
 */
export class OfflineRequestGrantComposition {
  readonly #request: JsonDocument;
  readonly #grant: JsonDocument;
  readonly #manifest: PreparedOfflineProposalManifest;
  readonly #subjectUser: string;
  readonly #runtimeId: string;
  readonly #agentId: string;
  readonly #credentialAudience: string;
  readonly #identityEvidence: JsonDocument;

  constructor(
    request: JsonDocument,
    grant: JsonDocument,
    manifest: PreparedOfflineProposalManifest,
    expectations: OfflineSelectedGrantExpectations,
  ) {
    this.#request = request;
    this.#grant = grant;
    this.#manifest = manifest;
    this.#subjectUser = expectations.subjectUser;
    this.#runtimeId = expectations.runtimeId;
    this.#agentId = expectations.agentId;
    this.#credentialAudience = expectations.credentialAudience;
    this.#identityEvidence = expectations.identityEvidence;
  }

  /** No clock, issuer, credential, identity-status or authority-store access. */
  validate(): void {
    // Preflight every caller document before any of them is parsed. In
    // particular, an oversized identity document must not follow parsed inputs.
    for (const document of [this.#request, this.#grant, this.#identityEvidence])
      checkSourceSize(document);
    const request = snapshot(this.#request);
    const grant = snapshot(this.#grant);
    const identityEvidence = snapshot(this.#identityEvidence);
    const expectations = {
      subjectUser: this.#subjectUser,
      runtimeId: this.#runtimeId,
      agentId: this.#agentId,
      credentialAudience: this.#credentialAudience,
      identityEvidence,
    };
    new OfflineSemanticGrantRequest(request, this.#manifest, expectations)
      .prepare()
      .validate();
    new OfflineSelectedGrant(grant, this.#manifest, expectations)
      .prepare()
      .validate();

    // Both snapshots are now completely validated closed objects. This
    // comparison does not normalize or discard unknown authority fields.
    const requested = expiry(request);
    const selected = expiry(grant);
    if (laterThan(selected, requested))
      throw new Error('grant_expiry_exceeds_request');
  }
}

function snapshot(document: JsonDocument): JsonDocument {
  checkSourceSize(document);
  // Read the original text, not a subclass's alternate parse result.
  const value = JsonDocument.prototype.parse.call(document, MAX_DOCUMENT_BYTES);
  const retained = new JsonDocument(JSON.stringify(value));
  retained.parse(MAX_DOCUMENT_BYTES);
  return retained;
}

function checkSourceSize(document: JsonDocument): void {
  if (!(document instanceof JsonDocument))
    throw new Error('invalid_composition_document');
  // Check retained source bytes before parsing; JsonDocument.parse calls the
  // overridable byte-length method, so its own check is not sufficient here.
  if (
    JsonDocument.prototype.utf8ByteLength.call(document) > MAX_DOCUMENT_BYTES
  ) {
    throw new Error('json_byte_limit');
  }
}

function expiry(document: JsonDocument): string {
  const value = document.parse(MAX_DOCUMENT_BYTES) as {
    constraints: { expires_at: string };
  };
  return value.constraints.expires_at;
}

function laterThan(selected: string, requested: string): boolean {
  // Component validators have already checked RFC 3339 calendar/zone syntax.
  // Date.parse alone truncates fractions to milliseconds; retain all digits.
  const selectedWhole = Date.parse(selected.replace(/\.\d+/, ''));
  const requestedWhole = Date.parse(requested.replace(/\.\d+/, ''));
  if (selectedWhole !== requestedWhole) return selectedWhole > requestedWhole;
  const selectedFraction = /\.(\d+)/.exec(selected)?.[1] ?? '';
  const requestedFraction = /\.(\d+)/.exec(requested)?.[1] ?? '';
  const width = Math.max(selectedFraction.length, requestedFraction.length);
  return (
    selectedFraction.padEnd(width, '0') > requestedFraction.padEnd(width, '0')
  );
}
