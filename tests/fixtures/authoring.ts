import { Type } from '@sinclair/typebox';
import type {
  ActionDeclaration,
  PreparedActionInventory,
} from '../../src/authoring/index.js';
import {
  JsonDocument,
  OfflineProposalManifest,
  OfflineSchemaResources,
  SurfaceSnapshot,
} from '../../src/index.js';

export const json = (value: unknown): JsonDocument =>
  new JsonDocument(JSON.stringify(value));
export const classes = json([
  {
    id: 'application.result',
    classification: 'private',
    label: 'Result',
    description: 'Application-owned result.',
  },
]);
export const base = 'https://calcu.example.test/schemas/v1/';

export function calculation() {
  const operator = Type.Union(
    ['add', 'subtract', 'multiply', 'divide'].map((value) =>
      Type.Literal(value),
    ),
  );
  const fields = { operator, left: Type.Number(), right: Type.Number() };
  return {
    action: {
      id: 'calculation.propose',
      scope: 'calculation.propose',
      risk: 'propose',
      side_effect: false,
      approval: 'none',
      execution: {
        mode: 'propose',
        operation_id: 'calculation.propose.operation',
        persisted: false,
      },
      data_exposure: {
        classes: ['application.result'],
        redaction: { mode: 'none' },
        retention: { mode: 'user_managed' },
      },
    },
    input: Type.Object(fields, { additionalProperties: false }),
    output: Type.Object(
      { ...fields, result: Type.Number() },
      { additionalProperties: false },
    ),
  } satisfies ActionDeclaration;
}

export function greeting() {
  const declaration = calculation();
  return {
    action: {
      ...declaration.action,
      id: 'greeting.propose',
      scope: 'greeting.invoke',
      execution: {
        ...declaration.action.execution,
        operation_id: 'greeting.prepare',
      },
    },
    input: Type.Object({}, { additionalProperties: false }),
    output: Type.Object(
      { greeting: Type.Literal('Hello, world!') },
      { additionalProperties: false },
    ),
  } satisfies ActionDeclaration;
}

/** Host fields intentionally remain separate from descriptor authoring. */
export function composed(prepared: PreparedActionInventory, version = '1') {
  const asp = 'https://github.com/0al-spec/agent-surface/';
  const origin = 'https://calcu.example.test';
  const dialect = 'https://json-schema.org/draft/2020-12/schema';
  const identity = {
    profile: `${asp}profiles/agent-identity-evidence/v1`,
    format_profile: `${asp}profiles/agent-passport-minimal/v1`,
    artifact_digest_profile: `${asp}hash/agent-passport-artifact/v1`,
    verification_profiles: [`${origin}/verify`],
    key_binding_profiles: [`${origin}/keys`],
    freshness_profiles: [`${origin}/freshness`],
    status_profiles: [`${origin}/status`],
    migration_profiles: [],
    max_artifact_bytes: 262144,
  };
  const resource = (name: string) => {
    const uri = `${origin}/schemas/${name}.json`;
    return {
      uri,
      document: json({
        $schema: dialect,
        $id: uri,
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      }),
    };
  };
  const event = resource('grant-revoked');
  const receipt = resource('receipt');
  const actions = prepared.actionDocuments.map(
    (document) => document.parse() as { scope: string },
  );
  const manifest = {
    protocol: 'agent-surface/0.1',
    app_id: 'calcu.example',
    issuer: origin,
    surface_mode: 'proposal_only',
    surface_version: version,
    surface_url: `${origin}/.well-known/agent-surface.json`,
    compatibility: {
      min_runtime: 'application-runtime/0.1',
      schema_dialect: dialect,
      agent_identity_evidence_profiles: [identity],
    },
    auth: {
      type: `${asp}profiles/host-provisioned-bearer/v1`,
      credential_profile: 'compatibility_bearer',
    },
    agent_api: {
      credential_audience: `${origin}/agent-api`,
      grant_introspection_url: `${origin}/agent-grants/introspect`,
      grant_revocation_url: `${origin}/agent-grants/revoke`,
      action_url: `${origin}/agent-actions`,
      session_control_url: `${origin}/agent-sessions/control`,
      event_subscription_url: `${origin}/agent-events`,
      event_delivery: {
        profile: 'at_least_once',
        ack_deadline_seconds: 30,
        max_in_flight: 8,
        retention_seconds: 300,
      },
    },
    scopes: actions.map((action) => ({
      id: action.scope,
      description: 'Application-owned proposal.',
    })),
    data_classes: classes.parse(),
    resources: [],
    actions,
    events: [
      {
        id: 'grant.revoked',
        control: true,
        schema: event.uri,
        data_exposure: {
          classes: [],
          redaction: { mode: 'none' },
          retention: { mode: 'transient', delete_on_grant_end: true },
        },
      },
    ],
    audit: {
      hash_profile: 'asp-jcs-sha-256',
      receipt_schema: receipt.uri,
      required_fields: [
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
      ],
    },
    revocation: {
      grant_management_url: `${origin}/settings/agent-grants`,
      grant_revocation_url: `${origin}/agent-grants/revoke`,
      event: 'grant.revoked',
    },
  };
  const hash = new SurfaceSnapshot(json(manifest)).hash();
  return {
    document: json({ ...manifest, surface_hash: hash }),
    hash,
    prepare: () =>
      new OfflineProposalManifest(
        json({ ...manifest, surface_hash: hash }),
        new OfflineSchemaResources([
          ...prepared.schemaResources,
          event,
          receipt,
        ]),
        json(identity),
      ).prepare(),
  };
}
