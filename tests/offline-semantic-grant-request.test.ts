import { describe, expect, it, vi } from 'vitest';
import {
  CanonicalObjectHash,
  JsonDocument,
  OfflineProposalManifest,
  type OfflineSchemaResource,
  OfflineSchemaResources,
  OfflineSemanticGrantRequest,
  type OfflineSemanticGrantRequestExpectations,
  SurfaceSnapshot,
} from '../src/index.js';

const ASP = 'https://github.com/0al-spec/agent-surface/';
const DIALECT = 'https://json-schema.org/draft/2020-12/schema';
const REQUEST_HASH_DOMAIN = `${ASP}hash/grant-request/v1`;
const INPUT_HASH_DOMAIN = `${ASP}hash/action-input-schema/v1`;
const IDENTITY_PROFILE = `${ASP}profiles/agent-identity-evidence/v1`;
const FORMAT_PROFILE = `${ASP}profiles/agent-passport-minimal/v1`;
const DIGEST_PROFILE = `${ASP}hash/agent-passport-artifact/v1`;
const HASH = `sha-256:${'A'.repeat(43)}`;

const RECEIPT_FIELDS = [
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
];

type RecordValue = Record<string, unknown>;

function json(value: unknown): JsonDocument {
  return new JsonDocument(JSON.stringify(value));
}

function resource(uri: string, schema: RecordValue): OfflineSchemaResource {
  return {
    uri,
    document: json({ $schema: DIALECT, $id: uri, ...schema }),
  };
}

function fixture(origin: string, actionId: string, scopeId: string) {
  const inputUri = `${origin}/schemas/${actionId}.input.json`;
  const outputUri = `${origin}/schemas/${actionId}.output.json`;
  const eventUri = `${origin}/schemas/grant-revoked.event.json`;
  const receiptUri = `${origin}/schemas/action-receipt.json`;
  const input = resource(inputUri, {
    type: 'object',
    properties: { value: { type: 'number' } },
    required: ['value'],
    additionalProperties: false,
  });
  const output = resource(outputUri, {
    type: 'object',
    properties: { value: { type: 'number' } },
    required: ['value'],
    additionalProperties: false,
  });
  const identityAdvertisement = {
    profile: IDENTITY_PROFILE,
    format_profile: FORMAT_PROFILE,
    artifact_digest_profile: DIGEST_PROFILE,
    verification_profiles: [`${origin}/profiles/verification/v1`],
    key_binding_profiles: [`${origin}/profiles/key-binding/v1`],
    freshness_profiles: [`${origin}/profiles/freshness/v1`],
    status_profiles: [`${origin}/profiles/status/v1`],
    migration_profiles: [],
    max_artifact_bytes: 262_144,
  };
  const evidence = {
    profile: IDENTITY_PROFILE,
    format_profile: FORMAT_PROFILE,
    artifact_ref: 'agent-passport://local-agent',
    artifact_digest: { profile: DIGEST_PROFILE, value: HASH },
    issuer: `${origin}/identity`,
    subject: 'agent-subject',
    verification_profile: `${origin}/profiles/verification/v1`,
    key_binding: {
      profile: `${origin}/profiles/key-binding/v1`,
      value: HASH,
    },
    lifecycle: {
      freshness_profile: `${origin}/profiles/freshness/v1`,
      status_profile: `${origin}/profiles/status/v1`,
      status_ref: 'status-subject',
    },
  };
  const actionExposure = {
    classes: ['application.result'],
    redaction: { mode: 'none' },
    retention: { mode: 'user_managed' },
  };
  const controlExposure = {
    classes: [],
    redaction: { mode: 'none' },
    retention: { mode: 'transient', delete_on_grant_end: true },
  };
  const values = {
    appId: `${actionId}.app`,
    issuer: origin,
    version: `${actionId}-v1`,
    actionUrl: `${origin}/agent-actions`,
    actionId,
    scopeId,
  };
  const manifest = {
    protocol: 'agent-surface/0.1',
    app_id: values.appId,
    issuer: origin,
    surface_mode: 'proposal_only',
    surface_version: values.version,
    surface_url: `${origin}/.well-known/agent-surface.json`,
    compatibility: {
      min_runtime: 'application-runtime/0.1',
      schema_dialect: DIALECT,
      agent_identity_evidence_profiles: [identityAdvertisement],
    },
    auth: {
      type: `${ASP}profiles/host-provisioned-bearer/v1`,
      credential_profile: 'compatibility_bearer',
    },
    agent_api: {
      credential_audience: `${origin}/agent-api`,
      grant_introspection_url: `${origin}/agent-grants/introspect`,
      grant_revocation_url: `${origin}/agent-grants/revoke`,
      action_url: values.actionUrl,
      session_control_url: `${origin}/agent-sessions/control`,
      event_subscription_url: `${origin}/agent-events`,
      event_delivery: {
        profile: 'at_least_once',
        ack_deadline_seconds: 30,
        max_in_flight: 8,
        retention_seconds: 300,
      },
    },
    scopes: [{ id: scopeId, description: 'Prepare an application proposal.' }],
    data_classes: [
      {
        id: 'application.result',
        classification: 'private',
        label: 'Application result',
        description: 'Application-owned result data.',
      },
    ],
    resources: [],
    actions: [
      {
        id: actionId,
        scope: scopeId,
        risk: 'propose',
        side_effect: false,
        approval: 'none',
        execution: {
          mode: 'propose',
          operation_id: `${actionId}.operation`,
          persisted: false,
        },
        input_schema: inputUri,
        input_schema_hash: new CanonicalObjectHash(INPUT_HASH_DOMAIN).digest(
          input.document,
        ),
        output_schema: outputUri,
        data_exposure: actionExposure,
      },
    ],
    events: [
      {
        id: 'grant.revoked',
        control: true,
        schema: eventUri,
        data_exposure: controlExposure,
      },
    ],
    audit: {
      hash_profile: 'asp-jcs-sha-256',
      receipt_schema: receiptUri,
      required_fields: RECEIPT_FIELDS,
    },
    revocation: {
      grant_management_url: `${origin}/settings/agent-grants`,
      grant_revocation_url: `${origin}/agent-grants/revoke`,
      event: 'grant.revoked',
    },
  };
  const surfaceHash = new SurfaceSnapshot(json(manifest)).hash();
  return {
    document: json({ ...manifest, surface_hash: surfaceHash }),
    resources: [
      input,
      output,
      resource(eventUri, { type: 'object' }),
      resource(receiptUri, { type: 'object' }),
    ],
    identity: json(identityAdvertisement),
    evidence,
    actionExposure,
    controlExposure,
    values: { ...values, surfaceHash },
  };
}

function preparedManifest(value: ReturnType<typeof fixture>) {
  return new OfflineProposalManifest(
    value.document,
    new OfflineSchemaResources(value.resources),
    value.identity,
  ).prepare();
}

function requestValue(value: ReturnType<typeof fixture>): RecordValue {
  return {
    locations: [value.values.actionUrl],
    actions: [value.values.actionId],
    delegate: {
      runtime: 'runtime-1',
      agent: 'agent-1',
      identity_evidence: value.evidence,
    },
    resource_server: {
      app_id: value.values.appId,
      issuer: value.values.issuer,
      surface_version: value.values.version,
      surface_hash: value.values.surfaceHash,
    },
    scopes: [value.values.scopeId],
    constraints: {
      expires_at: '2000-01-01T00:00:00Z',
      credential_release: { mode: 'deny' },
    },
    credential_profile: 'compatibility_bearer',
    audit: { local_receipt: 'required', app_receipt: 'required' },
  };
}

function expectations(
  value: ReturnType<typeof fixture>,
  overrides: Partial<OfflineSemanticGrantRequestExpectations> = {},
): OfflineSemanticGrantRequestExpectations {
  return {
    runtimeId: 'runtime-1',
    agentId: 'agent-1',
    identityEvidence: json(value.evidence),
    ...overrides,
  };
}

function candidate(
  value: ReturnType<typeof fixture>,
  request: RecordValue = requestValue(value),
  expected: OfflineSemanticGrantRequestExpectations = expectations(value),
): OfflineSemanticGrantRequest {
  return new OfflineSemanticGrantRequest(
    json(request),
    preparedManifest(value),
    expected,
  );
}

describe('bounded offline semantic Grant request', () => {
  it('accepts two unrelated manifests and derives action plus control-event exposure', () => {
    for (const [origin, actionId, scopeId] of [
      ['https://alpha-request.example.invalid', 'alpha.propose', 'alpha.scope'],
      ['https://beta-request.example.invalid', 'beta.prepare', 'beta.scope'],
    ] as const) {
      const value = fixture(origin, actionId, scopeId);
      const checked = candidate(value).prepare();
      checked.validate();
      expect(checked.dataExposure().parse()).toEqual([
        { source: { kind: 'action', id: actionId }, ...value.actionExposure },
        {
          source: { kind: 'event', id: 'grant.revoked' },
          ...value.controlExposure,
        },
      ]);
    }
  });

  it('uses the normative grant-request domain and is deterministic across object key order', () => {
    const vector = new CanonicalObjectHash(REQUEST_HASH_DOMAIN).digest(
      json({ delegate: { runtime: 'r' } }),
    );
    expect(vector).toBe('sha-256:NIahpleJauoH9OEqZhL1Spqj6oP1r78nA1A7GCwJnYA');

    const value = fixture(
      'https://hash-request.example.invalid',
      'hash.propose',
      'hash.scope',
    );
    const first = requestValue(value);
    const second = {
      audit: first.audit,
      credential_profile: first.credential_profile,
      constraints: first.constraints,
      scopes: first.scopes,
      resource_server: first.resource_server,
      delegate: first.delegate,
      actions: first.actions,
      locations: first.locations,
    };
    expect(candidate(value, first).prepare().hash()).toBe(
      candidate(value, second).prepare().hash(),
    );
  });

  it('rejects RFC 9396 type, every server output, and unknown request members', () => {
    const value = fixture(
      'https://closed-request.example.invalid',
      'closed.propose',
      'closed.scope',
    );
    for (const key of [
      'type',
      'grant_id',
      'grant_hash',
      'subject',
      'credential_binding',
      'data_exposure',
      'credential',
      'authorization_code',
      'server_output',
    ]) {
      const request = requestValue(value);
      request[key] = key === 'type' ? 'https://example.invalid/oauth' : {};
      expect(() => candidate(value, request).prepare()).toThrow(
        /^grant_request_incompatible$/,
      );
    }
  });

  it.each([
    [
      'runtime',
      (request: RecordValue) =>
        ((request.delegate as RecordValue).runtime = 'other'),
    ],
    [
      'agent',
      (request: RecordValue) =>
        ((request.delegate as RecordValue).agent = 'other'),
    ],
    [
      'app_id',
      (request: RecordValue) =>
        ((request.resource_server as RecordValue).app_id = 'other'),
    ],
    [
      'issuer',
      (request: RecordValue) =>
        ((request.resource_server as RecordValue).issuer =
          'https://other.invalid'),
    ],
    [
      'surface_version',
      (request: RecordValue) =>
        ((request.resource_server as RecordValue).surface_version = 'other'),
    ],
    [
      'surface_hash',
      (request: RecordValue) =>
        ((request.resource_server as RecordValue).surface_hash = HASH),
    ],
    [
      'location',
      (request: RecordValue) =>
        (request.locations = ['https://other.invalid/action']),
    ],
    ['action', (request: RecordValue) => (request.actions = ['other.action'])],
    ['scope', (request: RecordValue) => (request.scopes = ['other.scope'])],
  ])('rejects a rehashed wrong %s binding', (_name, mutate) => {
    const value = fixture(
      'https://binding-request.example.invalid',
      'binding.propose',
      'binding.scope',
    );
    const request = requestValue(value);
    mutate(request);
    expect(() => candidate(value, request).prepare()).toThrow(
      /^grant_request_binding_mismatch$|^grant_request_locations_mismatch$|^grant_request_actions_mismatch$|^grant_request_scopes_mismatch$/,
    );
  });

  it('validates profile, release, receipts and syntax-only expiration', () => {
    const value = fixture(
      'https://constraints-request.example.invalid',
      'constraints.propose',
      'constraints.scope',
    );
    expect(() => candidate(value).prepare()).not.toThrow();
    for (const mutate of [
      (request: RecordValue) => (request.credential_profile = 'proof_bound'),
      (request: RecordValue) =>
        ((
          (request.constraints as RecordValue).credential_release as RecordValue
        ).mode = 'allow'),
      (request: RecordValue) =>
        ((
          (request.constraints as RecordValue).credential_release as RecordValue
        ).extra = true),
      (request: RecordValue) =>
        ((request.constraints as RecordValue).expires_at = '2026-01-01'),
      (request: RecordValue) =>
        ((request.audit as RecordValue).local_receipt = 'optional'),
      (request: RecordValue) =>
        ((request.audit as RecordValue).app_receipt = 'optional'),
    ]) {
      const request = requestValue(value);
      mutate(request);
      expect(() => candidate(value, request).prepare()).toThrow();
    }
  });

  it('binds the complete identity envelope to advertisement and expected host evidence', () => {
    const value = fixture(
      'https://identity-request.example.invalid',
      'identity.propose',
      'identity.scope',
    );
    const mismatched = { ...value.evidence, subject: 'other' };
    const request = requestValue(value);
    (request.delegate as RecordValue).identity_evidence = mismatched;
    expect(() => candidate(value, request).prepare()).toThrow(
      /^grant_request_identity_mismatch$/,
    );
    expect(() =>
      candidate(value, requestValue(value), {
        ...expectations(value),
        identityEvidence: json(mismatched),
      }).prepare(),
    ).toThrow(/^grant_request_identity_mismatch$/);

    const unadvertised = requestValue(value);
    const evidence = (unadvertised.delegate as RecordValue)
      .identity_evidence as RecordValue;
    evidence.verification_profile = `${value.values.issuer}/profiles/other`;
    expect(() => candidate(value, unadvertised).prepare()).toThrow();
  });

  it('captures immutable inputs, caches success only, and rejects forged manifests', () => {
    const value = fixture(
      'https://lifecycle-request.example.invalid',
      'lifecycle.propose',
      'lifecycle.scope',
    );
    const expected = expectations(value);
    const instance = new OfflineSemanticGrantRequest(
      json(requestValue(value)),
      preparedManifest(value),
      expected,
    );
    (expected as { runtimeId: string }).runtimeId = 'changed';
    const checked = instance.prepare();
    expect(checked.hash()).toMatch(/^sha-256:[A-Za-z0-9_-]{43}$/);
    expect(() => Object.assign(checked, { hash: () => 'changed' })).toThrow();

    const parse = vi.spyOn(JsonDocument.prototype, 'parse');
    const invalid = requestValue(value);
    invalid.actions = ['wrong.action'];
    const failed = candidate(value, invalid);
    expect(() => failed.prepare()).toThrow();
    const firstCount = parse.mock.calls.length;
    expect(() => failed.prepare()).toThrow();
    expect(parse.mock.calls.length).toBeGreaterThan(firstCount);
    parse.mockRestore();

    const real = preparedManifest(value);
    const forged = {
      document: real.document,
      surfaceHash: real.surfaceHash,
      actionId: real.actionId,
      hash: () => real.hash(),
      validateInput: () => undefined,
      validateOutput: () => undefined,
    };
    expect(() =>
      new OfflineSemanticGrantRequest(
        json(requestValue(value)),
        forged,
        expectations(value),
      ).prepare(),
    ).toThrow(/^invalid_manifest_binding$/);
  });

  it.each([
    ['{"locations":[],"locations":[]}', 'duplicate_json_member'],
    ['{"locations":[] ,"x":-0}', 'invalid_json_number'],
    ['{"locations":[] ,"x":1e999}', 'invalid_json_number'],
    ['{"locations":[] ,"x":"\\ud800"}', 'invalid_unicode'],
  ])('rejects invalid request JSON before extraction: %s', (text, code) => {
    const value = fixture(
      'https://json-request.example.invalid',
      'json.propose',
      'json.scope',
    );
    expect(() =>
      new OfflineSemanticGrantRequest(
        new JsonDocument(text),
        preparedManifest(value),
        expectations(value),
      ).prepare(),
    ).toThrow(new RegExp(`^${code}$`));
  });
});
