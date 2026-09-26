import {
  CanonicalObjectHash,
  JsonDocument,
  OfflineProposalManifest,
  OfflineSchemaResources,
  OfflineSelectedGrant,
  OfflineSemanticGrantRequest,
  SurfaceSnapshot,
} from '@0al/agent-surface';

const ASP = 'https://github.com/0al-spec/agent-surface/';
const DIALECT = 'https://json-schema.org/draft/2020-12/schema';
const ORIGIN = 'https://hello.example.invalid';
const ACTION = 'greeting.propose';
const SCOPE = 'greeting.invoke';
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

const json = (value) => new JsonDocument(JSON.stringify(value));

const schema = (name, value) => ({
  uri: `${ORIGIN}/schemas/${name}.json`,
  document: json({
    $schema: DIALECT,
    $id: `${ORIGIN}/schemas/${name}.json`,
    ...value,
  }),
});

/**
 * Build and validate only offline ASP representations for this Hello app.
 * Evidence and Grant objects below are inert fixtures, not trusted identity,
 * consent, issuance, credential, session, or authority.
 */
export function prepareHelloValues() {
  const inputSchema = schema('greeting-input', {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  });
  const outputSchema = schema('greeting-output', {
    type: 'object',
    properties: { greeting: { const: 'Hello, world!' } },
    required: ['greeting'],
    additionalProperties: false,
  });
  const eventSchema = schema('grant-revoked-event', {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  });
  const receiptSchema = schema('action-receipt', {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  });

  const identityAdvertisement = {
    profile: `${ASP}profiles/agent-identity-evidence/v1`,
    format_profile: `${ASP}profiles/agent-passport-minimal/v1`,
    artifact_digest_profile: `${ASP}hash/agent-passport-artifact/v1`,
    verification_profiles: [`${ORIGIN}/profiles/test-verification/v1`],
    key_binding_profiles: [`${ORIGIN}/profiles/test-key-binding/v1`],
    freshness_profiles: [`${ORIGIN}/profiles/test-freshness/v1`],
    status_profiles: [`${ORIGIN}/profiles/test-status/v1`],
    migration_profiles: [],
    max_artifact_bytes: 262_144,
  };
  const evidenceFixture = {
    profile: identityAdvertisement.profile,
    format_profile: identityAdvertisement.format_profile,
    artifact_ref: 'agent-passport://fixture-only',
    artifact_digest: {
      profile: identityAdvertisement.artifact_digest_profile,
      value: HASH,
    },
    issuer: `${ORIGIN}/identity-fixture`,
    subject: 'hello-agent-fixture',
    verification_profile: identityAdvertisement.verification_profiles[0],
    key_binding: {
      profile: identityAdvertisement.key_binding_profiles[0],
      value: HASH,
    },
    lifecycle: {
      freshness_profile: identityAdvertisement.freshness_profiles[0],
      status_profile: identityAdvertisement.status_profiles[0],
      status_ref: 'fixture-only',
    },
  };
  const actionExposure = {
    classes: ['hello.public-text'],
    redaction: { mode: 'none' },
    retention: { mode: 'user_managed' },
  };
  const controlExposure = {
    classes: [],
    redaction: { mode: 'none' },
    retention: { mode: 'transient', delete_on_grant_end: true },
  };
  const actionUrl = `${ORIGIN}/agent-actions`;
  const manifestWithoutHash = {
    protocol: 'agent-surface/0.1',
    app_id: 'hello.example',
    issuer: ORIGIN,
    surface_mode: 'proposal_only',
    surface_version: '1',
    surface_url: `${ORIGIN}/.well-known/agent-surface.json`,
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
      credential_audience: `${ORIGIN}/agent-api`,
      grant_introspection_url: `${ORIGIN}/agent-grants/introspect`,
      grant_revocation_url: `${ORIGIN}/agent-grants/revoke`,
      action_url: actionUrl,
      session_control_url: `${ORIGIN}/agent-sessions/control`,
      event_subscription_url: `${ORIGIN}/agent-events`,
      event_delivery: {
        profile: 'at_least_once',
        ack_deadline_seconds: 30,
        max_in_flight: 8,
        retention_seconds: 300,
      },
    },
    scopes: [{ id: SCOPE, description: 'Prepare the fixed public greeting.' }],
    data_classes: [
      {
        id: 'hello.public-text',
        classification: 'public',
        label: 'Fixed greeting',
        description: 'The constant Hello, world! output.',
      },
    ],
    resources: [],
    actions: [
      {
        id: ACTION,
        scope: SCOPE,
        risk: 'propose',
        side_effect: false,
        approval: 'none',
        execution: {
          mode: 'propose',
          operation_id: ACTION,
          persisted: false,
        },
        input_schema: inputSchema.uri,
        input_schema_hash: new CanonicalObjectHash(
          `${ASP}hash/action-input-schema/v1`,
        ).digest(inputSchema.document),
        output_schema: outputSchema.uri,
        data_exposure: actionExposure,
      },
    ],
    events: [
      {
        id: 'grant.revoked',
        control: true,
        schema: eventSchema.uri,
        data_exposure: controlExposure,
      },
    ],
    audit: {
      hash_profile: 'asp-jcs-sha-256',
      receipt_schema: receiptSchema.uri,
      required_fields: RECEIPT_FIELDS,
    },
    revocation: {
      grant_management_url: `${ORIGIN}/settings/agent-grants`,
      grant_revocation_url: `${ORIGIN}/agent-grants/revoke`,
      event: 'grant.revoked',
    },
  };
  const surfaceHash = new SurfaceSnapshot(json(manifestWithoutHash)).hash();
  const manifest = json({ ...manifestWithoutHash, surface_hash: surfaceHash });
  const preparedManifest = new OfflineProposalManifest(
    manifest,
    new OfflineSchemaResources([
      inputSchema,
      outputSchema,
      eventSchema,
      receiptSchema,
    ]),
    json(identityAdvertisement),
  ).prepare();

  const requestValue = {
    locations: [actionUrl],
    actions: [ACTION],
    delegate: {
      runtime: 'hello-runtime-fixture',
      agent: 'hello-agent-fixture',
      identity_evidence: evidenceFixture,
    },
    resource_server: {
      app_id: 'hello.example',
      issuer: ORIGIN,
      surface_version: '1',
      surface_hash: surfaceHash,
    },
    scopes: [SCOPE],
    constraints: {
      expires_at: '2099-01-01T00:00:00Z',
      credential_release: { mode: 'deny' },
    },
    credential_profile: 'compatibility_bearer',
    audit: { local_receipt: 'required', app_receipt: 'required' },
  };
  const request = new OfflineSemanticGrantRequest(
    json(requestValue),
    preparedManifest,
    {
      runtimeId: 'hello-runtime-fixture',
      agentId: 'hello-agent-fixture',
      identityEvidence: json(evidenceFixture),
    },
  ).prepare();
  const grantValue = {
    grant_id: 'hello-grant-fixture',
    subject: { user: 'hello-user-fixture' },
    delegate: requestValue.delegate,
    resource_server: requestValue.resource_server,
    locations: requestValue.locations,
    actions: requestValue.actions,
    scopes: requestValue.scopes,
    constraints: requestValue.constraints,
    data_exposure: request.dataExposure().parse(),
    credential_profile: 'compatibility_bearer',
    credential_binding: {
      method: 'bearer',
      runtime_id: 'hello-runtime-fixture',
      agent_id: 'hello-agent-fixture',
      identity_evidence: evidenceFixture,
    },
    audit: { local_receipt: 'required', app_receipt: 'required' },
  };
  const grantHash = new CanonicalObjectHash(`${ASP}hash/grant/v1`).digest(
    json(grantValue),
  );
  const selectedGrant = new OfflineSelectedGrant(
    json({ ...grantValue, grant_hash: grantHash }),
    preparedManifest,
    {
      subjectUser: 'hello-user-fixture',
      runtimeId: 'hello-runtime-fixture',
      agentId: 'hello-agent-fixture',
      credentialAudience: `${ORIGIN}/agent-api`,
      identityEvidence: json(evidenceFixture),
    },
  ).prepare();

  preparedManifest.validateInput(ACTION, json({}));
  preparedManifest.validateOutput(ACTION, json({ greeting: 'Hello, world!' }));
  request.validate();
  selectedGrant.validate();

  return {
    actionId: preparedManifest.actionId,
    surfaceHash: preparedManifest.surfaceHash,
    requestHash: request.hash(),
    grantHash: selectedGrant.hash(),
    dataExposure: selectedGrant.dataExposure().parse(),
  };
}
