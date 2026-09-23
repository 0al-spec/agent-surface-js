import { describe, expect, it, vi } from 'vitest';
import {
  CanonicalObjectHash,
  JsonDocument,
  OfflineProposalManifest,
  type OfflineSchemaResource,
  OfflineSchemaResources,
  OfflineSelectedGrant,
  type OfflineSelectedGrantExpectations,
  type PreparedOfflineProposalManifest,
  SurfaceSnapshot,
} from '../src/index.js';

const ASP = 'https://github.com/0al-spec/agent-surface/';
const DIALECT = 'https://json-schema.org/draft/2020-12/schema';
const GRANT_HASH_DOMAIN = `${ASP}hash/grant/v1`;
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

function fixture(
  origin: string,
  actionId: string,
  scopeId: string,
): {
  document: JsonDocument;
  resources: OfflineSchemaResource[];
  identity: JsonDocument;
  evidence: RecordValue;
  actionExposure: RecordValue;
  controlExposure: RecordValue;
  values: {
    appId: string;
    issuer: string;
    version: string;
    audience: string;
    actionUrl: string;
    actionId: string;
    scopeId: string;
    surfaceHash: string;
  };
} {
  const inputUri = `${origin}/schemas/${actionId}.input.json`;
  const outputUri = `${origin}/schemas/${actionId}.output.json`;
  const eventUri = `${origin}/schemas/grant-revoked.event.json`;
  const receiptUri = `${origin}/schemas/action-receipt.json`;
  const input = resource(inputUri, {
    type: 'object',
    properties: {
      operator: { enum: ['add', 'subtract', 'multiply', 'divide'] },
      left: { type: 'number' },
      right: { type: 'number' },
    },
    required: ['operator', 'left', 'right'],
    additionalProperties: false,
  });
  const output = resource(outputUri, {
    type: 'object',
    properties: {
      operator: { enum: ['add', 'subtract', 'multiply', 'divide'] },
      left: { type: 'number' },
      right: { type: 'number' },
      result: { type: 'number' },
    },
    required: ['operator', 'left', 'right', 'result'],
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
    key_binding: { profile: `${origin}/profiles/key-binding/v1`, value: HASH },
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
  const appId = `${actionId}.app`;
  const version = `${actionId}-v1`;
  const audience = `${origin}/agent-api`;
  const actionUrl = `${origin}/agent-actions`;
  const manifest = {
    protocol: 'agent-surface/0.1',
    app_id: appId,
    issuer: origin,
    surface_mode: 'proposal_only',
    surface_version: version,
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
      credential_audience: audience,
      grant_introspection_url: `${origin}/agent-grants/introspect`,
      grant_revocation_url: `${origin}/agent-grants/revoke`,
      action_url: actionUrl,
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
  const identity = json(identityAdvertisement);
  return {
    document: json({ ...manifest, surface_hash: surfaceHash }),
    resources: [
      input,
      output,
      resource(eventUri, { type: 'object' }),
      resource(receiptUri, { type: 'object' }),
    ],
    identity,
    evidence,
    actionExposure,
    controlExposure,
    values: {
      appId,
      issuer: origin,
      version,
      audience,
      actionUrl,
      actionId,
      scopeId,
      surfaceHash,
    },
  };
}

function preparedManifest(value: ReturnType<typeof fixture>) {
  return new OfflineProposalManifest(
    value.document,
    new OfflineSchemaResources(value.resources),
    value.identity,
  ).prepare();
}

function grantValue(value: ReturnType<typeof fixture>): RecordValue {
  const { values } = value;
  return {
    grant_id: 'grant-opaque-1',
    subject: { user: 'user-1' },
    delegate: {
      runtime: 'runtime-1',
      agent: 'agent-1',
      identity_evidence: value.evidence,
    },
    resource_server: {
      app_id: values.appId,
      issuer: values.issuer,
      surface_version: values.version,
      surface_hash: values.surfaceHash,
    },
    locations: [values.actionUrl],
    actions: [values.actionId],
    scopes: [values.scopeId],
    constraints: {
      expires_at: '2000-01-01T00:00:00Z',
      credential_release: { mode: 'deny' },
    },
    data_exposure: [
      {
        source: { kind: 'action', id: values.actionId },
        ...value.actionExposure,
      },
      {
        source: { kind: 'event', id: 'grant.revoked' },
        ...value.controlExposure,
      },
    ],
    credential_profile: 'compatibility_bearer',
    credential_binding: {
      method: 'bearer',
      runtime_id: 'runtime-1',
      agent_id: 'agent-1',
      identity_evidence: value.evidence,
    },
    audit: { local_receipt: 'required', app_receipt: 'required' },
  };
}

function grantDocument(value: RecordValue): JsonDocument {
  const hash = new CanonicalObjectHash(GRANT_HASH_DOMAIN).digest(json(value));
  return json({ ...value, grant_hash: hash });
}

function expectations(
  value: ReturnType<typeof fixture>,
  overrides: Partial<OfflineSelectedGrantExpectations> = {},
): OfflineSelectedGrantExpectations {
  return {
    subjectUser: 'user-1',
    runtimeId: 'runtime-1',
    agentId: 'agent-1',
    credentialAudience: value.values.audience,
    identityEvidence: json(value.evidence),
    ...overrides,
  };
}

function candidate(
  value: ReturnType<typeof fixture>,
  grant: RecordValue = grantValue(value),
  expected: OfflineSelectedGrantExpectations = expectations(value),
): OfflineSelectedGrant {
  return new OfflineSelectedGrant(
    grantDocument(grant),
    preparedManifest(value),
    expected,
  );
}

function changedGrant(
  value: ReturnType<typeof fixture>,
  mutate: (grant: RecordValue) => void,
): JsonDocument {
  const grant = grantValue(value);
  mutate(grant);
  return grantDocument(grant);
}

describe('bounded offline selected Grant', () => {
  it('accepts two unrelated manifests and returns an issuer-derived projection', () => {
    for (const [origin, actionId, scopeId] of [
      ['https://alpha.example.invalid', 'alpha.propose', 'alpha.scope'],
      ['https://beta.example.invalid', 'beta.prepare', 'beta.scope'],
    ] as const) {
      const value = fixture(origin, actionId, scopeId);
      const checked = candidate(value).prepare();
      checked.validate();
      expect(checked.hash()).toBe(
        (grantDocument(grantValue(value)).parse() as RecordValue).grant_hash,
      );
      expect(checked.dataExposure().parse()).toEqual(
        grantValue(value).data_exposure,
      );
    }
  });

  it('requires the supplied hash and rejects stale or freshly rehashed invalid values', () => {
    const value = fixture(
      'https://hash.example.invalid',
      'hash.propose',
      'hash.scope',
    );
    const missing = grantValue(value);
    expect(() =>
      new OfflineSelectedGrant(
        json(missing),
        preparedManifest(value),
        expectations(value),
      ).prepare(),
    ).toThrow(/^grant_hash_required$/);

    const stale = grantDocument(grantValue(value));
    const staleObject = stale.parse() as RecordValue;
    staleObject.subject = { user: 'other-user' };
    expect(() =>
      new OfflineSelectedGrant(
        json(staleObject),
        preparedManifest(value),
        expectations(value),
      ).prepare(),
    ).toThrow(/^grant_hash_mismatch$/);

    expect(() =>
      new OfflineSelectedGrant(
        changedGrant(value, (grant) => {
          (grant.credential_binding as RecordValue).method =
            'compatibility_bearer';
        }),
        preparedManifest(value),
        expectations(value),
      ).prepare(),
    ).toThrow(/^grant_incompatible$/);
  });

  it('rejects noncanonical base64url identity digests even when all copies agree', () => {
    const value = fixture(
      'https://digest.example.invalid',
      'digest.propose',
      'digest.scope',
    );
    const noncanonicalDigest = `sha-256:${'A'.repeat(42)}B`;
    (value.evidence.artifact_digest as RecordValue).value = noncanonicalDigest;
    (value.evidence.key_binding as RecordValue).value = noncanonicalDigest;

    expect(() => candidate(value).prepare()).toThrow(/^grant_incompatible$/);
  });

  it.each([
    [
      'app_id',
      (grant: RecordValue) => {
        (grant.resource_server as RecordValue).app_id = 'other.app';
      },
    ],
    [
      'surface_version',
      (grant: RecordValue) => {
        (grant.resource_server as RecordValue).surface_version = 'other-v2';
      },
    ],
    [
      'surface_hash',
      (grant: RecordValue) => {
        (grant.resource_server as RecordValue).surface_hash = HASH;
      },
    ],
    [
      'location',
      (grant: RecordValue) => {
        grant.locations = ['https://other.example.invalid/agent-actions'];
      },
    ],
    [
      'action',
      (grant: RecordValue) => {
        grant.actions = ['other.action'];
      },
    ],
    [
      'scope',
      (grant: RecordValue) => {
        grant.scopes = ['other.scope'];
      },
    ],
  ])('rejects a rehashed wrong %s binding', (_name, mutate) => {
    const value = fixture(
      'https://binding.example.invalid',
      'binding.propose',
      'binding.scope',
    );
    expect(() =>
      new OfflineSelectedGrant(
        changedGrant(value, mutate),
        preparedManifest(value),
        expectations(value),
      ).prepare(),
    ).toThrow(
      /^grant_binding_mismatch$|^grant_locations_mismatch$|^grant_actions_mismatch$|^grant_scopes_mismatch$/,
    );
  });

  it('binds the logical audience independently and never accepts a wire alias', () => {
    const value = fixture(
      'https://audience.example.invalid',
      'audience.propose',
      'audience.scope',
    );
    expect(() =>
      candidate(value, grantValue(value), {
        ...expectations(value),
        credentialAudience: `${value.values.issuer}/agent-actions`,
      }).prepare(),
    ).toThrow(/^grant_audience_mismatch$/);

    expect(() =>
      new OfflineSelectedGrant(
        changedGrant(value, (grant) => {
          grant.credential_audience = value.values.audience;
        }),
        preparedManifest(value),
        expectations(value),
      ).prepare(),
    ).toThrow(/^grant_incompatible$/);
  });

  it('requires both complete equal identity-evidence copies and expected issuer metadata', () => {
    const value = fixture(
      'https://identity.example.invalid',
      'identity.propose',
      'identity.scope',
    );
    expect(() =>
      new OfflineSelectedGrant(
        changedGrant(value, (grant) => {
          const delegate = grant.delegate as RecordValue;
          delegate.identity_evidence = {
            ...value.evidence,
            subject: 'other',
          };
        }),
        preparedManifest(value),
        expectations(value),
      ).prepare(),
    ).toThrow(/^grant_identity_mismatch$/);

    expect(() =>
      new OfflineSelectedGrant(
        changedGrant(value, (grant) => {
          const binding = grant.credential_binding as RecordValue;
          delete binding.identity_evidence;
        }),
        preparedManifest(value),
        expectations(value),
      ).prepare(),
    ).toThrow(/^grant_incompatible$/);

    const otherExpected = { ...value.evidence, subject: 'other' };
    expect(() =>
      candidate(
        value,
        grantValue(value),
        expectations(value, {
          identityEvidence: json(otherExpected),
        }),
      ).prepare(),
    ).toThrow(/^grant_identity_mismatch$/);
  });

  it('derives exact source closure and rejects omitted, widened, stale, or reordered exposure', () => {
    const value = fixture(
      'https://exposure.example.invalid',
      'exposure.propose',
      'exposure.scope',
    );
    const cases = [
      (grant: RecordValue) => {
        grant.data_exposure = (grant.data_exposure as unknown[]).slice(0, 1);
      },
      (grant: RecordValue) => {
        const first = (grant.data_exposure as RecordValue[])[0];
        if (first === undefined) throw new Error('fixture_projection_missing');
        first.classes = [];
      },
      (grant: RecordValue) => {
        grant.data_exposure = (grant.data_exposure as unknown[]).reverse();
      },
      (grant: RecordValue) => {
        (grant.data_exposure as RecordValue[]).push({
          source: { kind: 'resource', id: 'not-selected' },
          classes: [],
          redaction: { mode: 'none' },
          retention: { mode: 'user_managed' },
        });
      },
    ];
    for (const mutate of cases) {
      expect(() =>
        new OfflineSelectedGrant(
          changedGrant(value, mutate),
          preparedManifest(value),
          expectations(value),
        ).prepare(),
      ).toThrow(/^grant_data_exposure_mismatch$/);
    }
  });

  it('rejects unsupported constraints and credential material, while expired valid syntax remains representation-valid', () => {
    const value = fixture(
      'https://constraints.example.invalid',
      'constraints.propose',
      'constraints.scope',
    );
    expect(() =>
      new OfflineSelectedGrant(
        changedGrant(value, (grant) => {
          (grant.constraints as RecordValue).expires_at = '2026-01-01';
        }),
        preparedManifest(value),
        expectations(value),
      ).prepare(),
    ).toThrow(/^grant_constraints_invalid$/);

    expect(() =>
      new OfflineSelectedGrant(
        changedGrant(value, (grant) => {
          (grant.constraints as RecordValue).expires_at =
            '2000-01-01t00:00:00z';
        }),
        preparedManifest(value),
        expectations(value),
      ).prepare(),
    ).not.toThrow();

    expect(() =>
      new OfflineSelectedGrant(
        changedGrant(value, (grant) => {
          (grant.constraints as RecordValue).budgets = { max_tool_calls: 1 };
        }),
        preparedManifest(value),
        expectations(value),
      ).prepare(),
    ).toThrow(/^grant_incompatible$/);

    expect(() =>
      new OfflineSelectedGrant(
        changedGrant(value, (grant) => {
          (grant.audit as RecordValue).local_receipt = 'optional';
        }),
        preparedManifest(value),
        expectations(value),
      ).prepare(),
    ).toThrow(/^grant_incompatible$/);

    expect(() =>
      new OfflineSelectedGrant(
        changedGrant(value, (grant) => {
          grant.credential = `bearer-${'x'.repeat(20)}`;
        }),
        preparedManifest(value),
        expectations(value),
      ).prepare(),
    ).toThrow(/^grant_incompatible$/);

    expect(() => candidate(value).prepare()).not.toThrow();
  });

  it('preserves caller inputs, projection immutability, and uncached failed preparation', () => {
    const value = fixture(
      'https://immutable-grant.example.invalid',
      'immutable.propose',
      'immutable.scope',
    );
    const expected = expectations(value);
    const instance = new OfflineSelectedGrant(
      grantDocument(grantValue(value)),
      preparedManifest(value),
      expected,
    );
    (expected as { subjectUser: string }).subjectUser = 'changed';
    const checked = instance.prepare();
    const projected = checked.dataExposure();
    const first = (projected.parse() as RecordValue[])[0];
    if (first === undefined) throw new Error('fixture_projection_missing');
    first.source = {
      kind: 'action',
      id: 'changed',
    };
    expect(checked.dataExposure().parse()).toEqual(
      grantValue(value).data_exposure,
    );
    expect(() => Object.assign(checked, { hash: () => 'changed' })).toThrow();

    const invalid = changedGrant(value, (grant) => {
      grant.actions = ['wrong.action'];
    });
    const parse = vi.spyOn(JsonDocument.prototype, 'parse');
    const failed = new OfflineSelectedGrant(
      invalid,
      preparedManifest(value),
      expectations(value),
    );
    expect(() => failed.prepare()).toThrow();
    const firstCount = parse.mock.calls.length;
    expect(() => failed.prepare()).toThrow();
    expect(parse.mock.calls.length).toBeGreaterThan(firstCount);
    parse.mockRestore();
  });

  it('rejects a forged structural manifest collaborator', () => {
    const value = fixture(
      'https://forged-manifest.example.invalid',
      'forged.propose',
      'forged.scope',
    );
    const real = preparedManifest(value);
    const forged = {
      document: real.document,
      surfaceHash: real.surfaceHash,
      actionId: real.actionId,
      hash: () => real.hash(),
      validateInput: () => undefined,
      validateOutput: () => undefined,
    } as PreparedOfflineProposalManifest;
    expect(() =>
      new OfflineSelectedGrant(
        grantDocument(grantValue(value)),
        forged,
        expectations(value),
      ).prepare(),
    ).toThrow(/^invalid_manifest_binding$/);
  });

  it.each([
    ['{"grant_id":"x","grant_id":"x"}', 'duplicate_json_member'],
    ['{"x":-0}', 'invalid_json_number'],
    ['{"x":1e999}', 'invalid_json_number'],
    ['{"x":"\\ud800"}', 'invalid_unicode'],
  ])('rejects raw Grant JSON before extraction: %s', (text, code) => {
    const value = fixture(
      'https://json-grant.example.invalid',
      'json.propose',
      'json.scope',
    );
    expect(() =>
      new OfflineSelectedGrant(
        new JsonDocument(text),
        preparedManifest(value),
        expectations(value),
      ).prepare(),
    ).toThrow(new RegExp(`^${code}$`));
  });
});
