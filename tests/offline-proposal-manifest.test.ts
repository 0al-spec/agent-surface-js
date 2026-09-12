import { describe, expect, it, vi } from 'vitest';
import {
  CanonicalObjectHash,
  JsonDocument,
  OfflineProposalManifest,
  type OfflineSchemaResource,
  OfflineSchemaResources,
  SurfaceSnapshot,
} from '../src/index.js';

const ASP = 'https://github.com/0al-spec/agent-surface/';
const DIALECT = 'https://json-schema.org/draft/2020-12/schema';
const INPUT_HASH_DOMAIN = `${ASP}hash/action-input-schema/v1`;

const receiptFields = [
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

function json(value: unknown): JsonDocument {
  return new JsonDocument(JSON.stringify(value));
}

function resource(
  uri: string,
  schema: Record<string, unknown>,
): OfflineSchemaResource {
  return {
    uri,
    document: json({ $schema: DIALECT, $id: uri, ...schema }),
  };
}

function buildFixture(
  origin: string,
  actionId: string,
  scopeId: string,
  variant: 'calculation' | 'greeting' = 'calculation',
): {
  document: JsonDocument;
  resources: OfflineSchemaResource[];
  identity: JsonDocument;
  input: JsonDocument;
  output: JsonDocument;
} {
  const inputUri = `${origin}/schemas/${actionId}.input.json`;
  const outputUri = `${origin}/schemas/${actionId}.output.json`;
  const eventUri = `${origin}/schemas/grant-revoked.event.json`;
  const receiptUri = `${origin}/schemas/action-receipt.json`;
  const input =
    variant === 'calculation'
      ? resource(inputUri, {
          type: 'object',
          properties: {
            operator: { enum: ['add', 'subtract', 'multiply', 'divide'] },
            left: { type: 'number' },
            right: { type: 'number' },
          },
          required: ['operator', 'left', 'right'],
          additionalProperties: false,
        })
      : resource(inputUri, {
          type: 'object',
          properties: { name: { type: 'string', minLength: 1 } },
          required: ['name'],
          additionalProperties: false,
        });
  const output =
    variant === 'calculation'
      ? resource(outputUri, {
          type: 'object',
          properties: {
            operator: { enum: ['add', 'subtract', 'multiply', 'divide'] },
            left: { type: 'number' },
            right: { type: 'number' },
            result: { type: 'number' },
          },
          required: ['operator', 'left', 'right', 'result'],
          additionalProperties: false,
        })
      : resource(outputUri, {
          type: 'object',
          properties: { greeting: { type: 'string', minLength: 1 } },
          required: ['greeting'],
          additionalProperties: false,
        });
  const inputHash = new CanonicalObjectHash(INPUT_HASH_DOMAIN).digest(
    input.document,
  );
  const identity = {
    profile: `${ASP}profiles/agent-identity-evidence/v1`,
    format_profile: `${ASP}profiles/agent-passport-minimal/v1`,
    artifact_digest_profile: `${ASP}hash/agent-passport-artifact/v1`,
    verification_profiles: [`${origin}/profiles/verification/v1`],
    key_binding_profiles: [`${origin}/profiles/key-binding/v1`],
    freshness_profiles: [`${origin}/profiles/freshness/v1`],
    status_profiles: [`${origin}/profiles/status/v1`],
    migration_profiles: [],
    max_artifact_bytes: 262_144,
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
  const manifest = {
    protocol: 'agent-surface/0.1',
    app_id: `${actionId}.app`,
    issuer: origin,
    surface_mode: 'proposal_only',
    surface_version: `${actionId}-v1`,
    surface_url: `${origin}/.well-known/agent-surface.json`,
    compatibility: {
      min_runtime: 'application-runtime/0.1',
      schema_dialect: DIALECT,
      agent_identity_evidence_profiles: [identity],
    },
    auth: {
      type: `${ASP}profiles/host-provisioned-bearer/v1`,
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
        input_schema_hash: inputHash,
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
      required_fields: receiptFields,
    },
    revocation: {
      grant_management_url: `${origin}/settings/agent-grants`,
      grant_revocation_url: `${origin}/agent-grants/revoke`,
      event: 'grant.revoked',
    },
  };
  const withoutHash = json(manifest);
  const surfaceHash = new SurfaceSnapshot(withoutHash).hash();
  const document = json({ ...manifest, surface_hash: surfaceHash });
  return {
    document,
    resources: [
      input,
      output,
      resource(eventUri, { type: 'object' }),
      resource(receiptUri, { type: 'object' }),
    ],
    identity: json(identity),
    input:
      variant === 'calculation'
        ? json({ operator: 'multiply', left: 111, right: 2 })
        : json({ name: 'Ada' }),
    output:
      variant === 'calculation'
        ? json({
            operator: 'multiply',
            left: 111,
            right: 2,
            result: 222,
          })
        : json({ greeting: 'Hello, Ada!' }),
  };
}

function parsed(document: JsonDocument): Record<string, unknown> {
  return document.parse() as Record<string, unknown>;
}

function changed(
  fixture: ReturnType<typeof buildFixture>,
  mutate: (manifest: Record<string, unknown>) => void,
): JsonDocument {
  const manifest = parsed(fixture.document);
  delete manifest.surface_hash;
  mutate(manifest);
  const hash = new SurfaceSnapshot(json(manifest)).hash();
  return json({ ...manifest, surface_hash: hash });
}

function checker(
  document: JsonDocument,
  resources: OfflineSchemaResource[],
  expectedIdentityEntry: JsonDocument,
): OfflineProposalManifest {
  return new OfflineProposalManifest(
    document,
    new OfflineSchemaResources(resources),
    expectedIdentityEntry,
  );
}

describe('bounded offline selected proposal manifest', () => {
  it.each([
    ['agent_api', 'action_url', '/agent-%65vents'],
    ['agent_api', 'session_control_url', '/agent-%61ctions'],
    ['agent_api', 'event_subscription_url', '/agent-%61ctions'],
    ['agent_api', 'grant_introspection_url', '/agent-%61ctions'],
    ['revocation', 'grant_management_url', '/agent-%61ctions'],
    ['agent_api', 'credential_audience', '/agent-%61ctions'],
    ['', 'surface_url', '/agent-%61ctions'],
  ])('rejects unreserved escape alias in %s.%s', (container, key, path) => {
    const fixture = buildFixture(
      'https://alpha.example.invalid',
      'alpha.propose',
      'alpha.scope',
    );
    const document = changed(fixture, (manifest) => {
      const target =
        container === ''
          ? manifest
          : (manifest[container] as Record<string, unknown>);
      target[key] = `https://alpha.example.invalid${path}`;
    });
    expect(new SurfaceSnapshot(document).hash()).toBe(
      parsed(document).surface_hash,
    );
    expect(() =>
      checker(document, fixture.resources, fixture.identity).prepare(),
    ).toThrow(/^surface_incompatible$/);
  });

  it('rejects all escaped unreserved characters in both hexadecimal cases', () => {
    const fixture = buildFixture(
      'https://alpha.example.invalid',
      'alpha.propose',
      'alpha.scope',
    );
    for (const character of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~') {
      const hex = character.charCodeAt(0).toString(16);
      for (const escaped of new Set([hex.toLowerCase(), hex.toUpperCase()])) {
        const document = changed(fixture, (manifest) => {
          (manifest.agent_api as Record<string, unknown>).action_url =
            `https://alpha.example.invalid/path-%${escaped}`;
        });
        expect(() =>
          checker(document, fixture.resources, fixture.identity).prepare(),
        ).toThrow(/^surface_incompatible$/);
      }
    }
  });

  it.each([
    '/agent-grants/introspect',
    '/agent-grants/revoke',
    '/agent-actions',
    '/agent-sessions/control',
    '/agent-events',
    '/settings/agent-grants',
    '/.well-known/agent-surface.json',
  ])('rejects logical audience aliasing %s', (path) => {
    const fixture = buildFixture(
      'https://alpha.example.invalid',
      'alpha.propose',
      'alpha.scope',
    );
    const document = changed(fixture, (manifest) => {
      (manifest.agent_api as Record<string, unknown>).credential_audience =
        `https://alpha.example.invalid${path}`;
    });
    expect(() =>
      checker(document, fixture.resources, fixture.identity).prepare(),
    ).toThrow(/^surface_incompatible$/);
  });

  it('accepts omitted persisted without changing the original declaration', () => {
    const fixture = buildFixture(
      'https://alpha.example.invalid',
      'alpha.propose',
      'alpha.scope',
    );
    const document = changed(fixture, (manifest) => {
      const action = (manifest.actions as Record<string, unknown>[])[0];
      delete (action?.execution as Record<string, unknown>).persisted;
    });
    const prepared = checker(
      document,
      fixture.resources,
      fixture.identity,
    ).prepare();
    expect(prepared.document.parse()).toEqual(document.parse());
  });

  it.each([
    ['protocol', 'agent-surface/0.2'],
    ['surface_mode', 'standard'],
    ['auth.credential_profile', 'proof_bound'],
    ['auth.authorization_url', 'https://foreign.example/authorize'],
    ['agent_api.grant_request_url', 'https://foreign.example/issue'],
    ['agent_api.action_url', 'http://alpha.example.invalid/action'],
    ['agent_api.action_url', 'https://other.example.invalid/action'],
    ['agent_api.action_url', 'https://alpha.example.invalid/action?'],
    ['agent_api.action_url', 'https://alpha.example.invalid/action#'],
    ['agent_api.action_url', 'https://alpha.example.invalid/action%zz'],
    ['agent_api.action_url', 'https://ALPHA.example.invalid/action'],
    ['agent_api.action_url', 'https://alpha.example.invalid:443/action'],
    ['agent_api.action_url', 'https://alpha.example.invalid/a/../action'],
    ['agent_api.action_url', 'https://user@alpha.example.invalid/action'],
    ['agent_api.action_url', 'https://alpha.example.invalid\\action'],
    [
      'revocation.grant_management_url',
      'https://alpha.example.invalid/agent-actions',
    ],
    [
      'revocation.grant_revocation_url',
      'https://alpha.example.invalid/other-revoke',
    ],
    ['actions.0.scope', 'undeclared.scope'],
    ['actions.0.execution.operation_id', ''],
    ['actions.0.execution.persisted', true],
    ['actions.0.execution.commit_action', 'other.commit'],
    ['actions.0.effects', []],
    ['actions.0.approval', 'required'],
    ['events.0.scope', 'alpha.scope'],
    ['events.0.control', false],
    [
      'compatibility.purpose_binding_profiles',
      ['https://example.invalid/purpose'],
    ],
  ])('rejects freshly rehashed mutation %s = %j', (path, value) => {
    const fixture = buildFixture(
      'https://alpha.example.invalid',
      'alpha.propose',
      'alpha.scope',
    );
    const document = changed(fixture, (manifest) => {
      const keys = path.split('.');
      const last = keys.pop();
      if (last === undefined) throw new Error('fixture_path_missing');
      let target: unknown = manifest;
      for (const key of keys) target = (target as Record<string, unknown>)[key];
      (target as Record<string, unknown>)[last] = value;
    });
    // Integrity really passes: rejection must come from semantic acceptance.
    expect(new SurfaceSnapshot(document).hash()).toBe(
      parsed(document).surface_hash,
    );
    const candidate = checker(document, fixture.resources, fixture.identity);
    expect(() => candidate.prepare()).toThrow(/^surface_incompatible$/);
    expect(() => candidate.prepare()).toThrow(/^surface_incompatible$/);
  });

  it('keeps supplied hash failure separate from semantic validation', () => {
    const fixture = buildFixture(
      'https://hash.example.invalid',
      'hash.propose',
      'hash.scope',
    );
    const manifest = parsed(fixture.document);
    manifest.app_id = 'changed.with.stale.hash';
    expect(() =>
      checker(json(manifest), fixture.resources, fixture.identity).prepare(),
    ).toThrow(/^surface_hash_mismatch$/);
  });

  it.each([
    '{"x":-0}',
    '{"x":1e999}',
    '{"x":"\\ud800"}',
    '{',
  ])('parses raw invalid input only at preparation: %s', (text) => {
    const fixture = buildFixture(
      'https://json.example.invalid',
      'json.propose',
      'json.scope',
    );
    const candidate = checker(
      new JsonDocument(text),
      fixture.resources,
      fixture.identity,
    );
    expect(() => candidate.prepare()).toThrow(
      /^invalid_json_number$|^invalid_unicode$|^invalid_json$/,
    );
  });

  it('accepts two unrelated generic fixtures and retains input/output checks', () => {
    for (const [origin, actionId, scopeId] of [
      ['https://alpha.example.invalid', 'alpha.propose', 'alpha.scope'],
      ['https://beta.example.invalid', 'beta.prepare', 'beta.scope'],
    ] as const) {
      const fixture = buildFixture(
        origin,
        actionId,
        scopeId,
        origin.startsWith('https://beta') ? 'greeting' : 'calculation',
      );
      const manifest = checker(
        fixture.document,
        fixture.resources,
        fixture.identity,
      );
      const prepared = manifest.prepare();
      expect(manifest.prepare()).toBe(prepared);
      expect(prepared.document).toBe(fixture.document);
      expect(prepared.surfaceHash).toBe(prepared.hash());
      expect(prepared.actionId).toBe(actionId);
      expect(() =>
        prepared.validateInput(actionId, fixture.input),
      ).not.toThrow();
      expect(() =>
        prepared.validateOutput(actionId, fixture.output),
      ).not.toThrow();
      expect(() =>
        prepared.validateInput(actionId, json({ operator: 'sqrt' })),
      ).toThrow(/^schema_instance_invalid$/);
      expect(() =>
        prepared.validateOutput(actionId, json({ result: '222' })),
      ).toThrow(/^schema_instance_invalid$/);
      expect(() =>
        prepared.validateInput('other.action', fixture.input),
      ).toThrow(/^action_unknown$/);
    }
  });

  it('requires the supplied hash and rejects a freshly rehashed invalid manifest', () => {
    const fixture = buildFixture(
      'https://hash.example.invalid',
      'hash.propose',
      'hash.scope',
    );
    const withoutHash = parsed(fixture.document);
    delete withoutHash.surface_hash;
    expect(() =>
      checker(json(withoutHash), fixture.resources, fixture.identity).prepare(),
    ).toThrow(/^surface_hash_required$/);

    const invalid = changed(fixture, (manifest) => {
      const actions = manifest.actions as Record<string, unknown>[];
      const action = actions[0] as Record<string, unknown>;
      action.side_effect = true;
    });
    expect(() =>
      checker(invalid, fixture.resources, fixture.identity).prepare(),
    ).toThrow(/^surface_incompatible$/);
  });

  it('rejects unknown members, auth/mode errors, route aliases, and missing controls', () => {
    const fixture = buildFixture(
      'https://grammar.example.invalid',
      'grammar.propose',
      'grammar.scope',
    );
    const cases: JsonDocument[] = [
      changed(fixture, (manifest) => {
        manifest.unsupported = true;
      }),
      changed(fixture, (manifest) => {
        (manifest.auth as Record<string, unknown>).type = 'oauth2';
      }),
      changed(fixture, (manifest) => {
        const actions = manifest.actions as Record<string, unknown>[];
        (actions[0]?.execution as Record<string, unknown>).mode = 'read';
      }),
      changed(fixture, (manifest) => {
        const api = manifest.agent_api as Record<string, unknown>;
        api.session_control_url = api.action_url;
      }),
      changed(fixture, (manifest) => {
        const api = manifest.agent_api as Record<string, unknown>;
        (manifest.revocation as Record<string, unknown>).grant_management_url =
          api.event_subscription_url;
      }),
      changed(fixture, (manifest) => {
        const api = manifest.agent_api as Record<string, unknown>;
        api.action_url = `${api.action_url}?alias=1`;
      }),
      changed(fixture, (manifest) => {
        manifest.events = [];
      }),
      changed(fixture, (manifest) => {
        manifest.audit = {};
      }),
    ];
    for (const document of cases) {
      expect(() =>
        checker(document, fixture.resources, fixture.identity).prepare(),
      ).toThrow(
        /^surface_incompatible$|^control_event_count_limit$|^surface_hash_mismatch$|^audit_required_field_missing$/,
      );
    }
  });

  it('rejects missing or rebound schema resources while retaining exact refs', () => {
    const fixture = buildFixture(
      'https://schema.example.invalid',
      'schema.propose',
      'schema.scope',
    );
    const missingInput = fixture.resources.slice(1);
    expect(() =>
      checker(fixture.document, missingInput, fixture.identity).prepare(),
    ).toThrow(/^schema_resource_missing$/);

    const wrongInput = resource(fixture.resources[0]?.uri ?? '', {
      type: 'string',
    });
    expect(() =>
      checker(
        fixture.document,
        [wrongInput, ...fixture.resources.slice(1)],
        fixture.identity,
      ).prepare(),
    ).toThrow(/^input_schema_hash_mismatch$/);

    const missingOutput = fixture.resources.slice(0, 1);
    expect(() =>
      checker(fixture.document, missingOutput, fixture.identity).prepare(),
    ).toThrow(/^schema_resource_missing$/);

    const missingEvent = checker(
      fixture.document,
      fixture.resources.slice(0, 2),
      fixture.identity,
    );
    expect(() => missingEvent.prepare()).toThrow(/^schema_resource_missing$/);
    expect(() => missingEvent.prepare()).toThrow(/^schema_resource_missing$/);

    const missingReceipt = checker(
      fixture.document,
      fixture.resources.slice(0, 3),
      fixture.identity,
    );
    expect(() => missingReceipt.prepare()).toThrow(/^schema_resource_missing$/);
  });

  it('checks every retained exposure and identity/audit declaration', () => {
    const fixture = buildFixture(
      'https://exposure.example.invalid',
      'exposure.propose',
      'exposure.scope',
    );
    const badExposure = changed(fixture, (manifest) => {
      const actions = manifest.actions as Record<string, unknown>[];
      const action = actions[0] as Record<string, unknown>;
      (action.data_exposure as Record<string, unknown>).classes = ['unknown'];
    });
    expect(() =>
      checker(badExposure, fixture.resources, fixture.identity).prepare(),
    ).toThrow(/^invalid_data_exposure$/);

    const badIdentity = changed(fixture, (manifest) => {
      const compatibility = manifest.compatibility as Record<string, unknown>;
      const profiles = compatibility.agent_identity_evidence_profiles as Record<
        string,
        unknown
      >[];
      const first = profiles[0];
      if (first === undefined) throw new Error('fixture_identity_missing');
      first.status_profiles = [];
    });
    expect(() =>
      checker(badIdentity, fixture.resources, fixture.identity).prepare(),
    ).toThrow(/^identity_profile_required$/);

    const reboundIdentity = changed(fixture, (manifest) => {
      const compatibility = manifest.compatibility as Record<string, unknown>;
      const profiles = compatibility.agent_identity_evidence_profiles as Record<
        string,
        unknown
      >[];
      const first = profiles[0];
      if (first === undefined) throw new Error('fixture_identity_missing');
      first.verification_profiles = [
        'https://different.example.invalid/profiles/verification/v1',
      ];
    });
    expect(() =>
      checker(reboundIdentity, fixture.resources, fixture.identity).prepare(),
    ).toThrow(/^identity_profile_mismatch$/);

    const unknownExpectedValue = parsed(fixture.identity);
    const unknownExpectedProfiles =
      unknownExpectedValue.verification_profiles as string[];
    unknownExpectedProfiles[0] =
      'https://unknown-profile.example.invalid/verification/v9';
    expect(() =>
      checker(
        fixture.document,
        fixture.resources,
        json(unknownExpectedValue),
      ).prepare(),
    ).toThrow(/^identity_profile_mismatch$/);

    const missingAuditField = changed(fixture, (manifest) => {
      const audit = manifest.audit as Record<string, unknown>;
      audit.required_fields = receiptFields.slice(1);
    });
    expect(() =>
      checker(missingAuditField, fixture.resources, fixture.identity).prepare(),
    ).toThrow(/^audit_required_field_missing$/);
  });

  it('preserves immutable source bytes and rejects duplicate JSON before extraction', () => {
    const fixture = buildFixture(
      'https://immutable.example.invalid',
      'immutable.propose',
      'immutable.scope',
    );
    const document = fixture.document;
    const prepared = checker(
      document,
      fixture.resources,
      fixture.identity,
    ).prepare();
    const original = parsed(document);
    (parsed(document) as Record<string, unknown>).app_id = 'changed';
    expect(parsed(prepared.document)).toEqual(original);
    expect(prepared.hash()).toBe(original.surface_hash);
    expect(() =>
      Object.assign(prepared, {
        actionId: 'other.action',
        surfaceHash: 'wrong',
      }),
    ).toThrow();
    expect(prepared.actionId).toBe('immutable.propose');
    expect(prepared.surfaceHash).toBe(original.surface_hash);

    const duplicate = new JsonDocument(
      '{"protocol":"agent-surface/0.1","protocol":"agent-surface/0.1"}',
    );
    expect(() =>
      checker(duplicate, fixture.resources, fixture.identity).prepare(),
    ).toThrow(/^duplicate_json_member$/);
  });

  it('does not parse dependencies during construction', () => {
    const fixture = buildFixture(
      'https://lazy.example.invalid',
      'lazy.propose',
      'lazy.scope',
    );
    const parse = vi.spyOn(JsonDocument.prototype, 'parse');
    const manifest = checker(
      fixture.document,
      fixture.resources,
      fixture.identity,
    );
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
    expect(() => manifest.prepare()).not.toThrow();
  });

  it('bounds retained manifest bytes and action inventory', () => {
    const fixture = buildFixture(
      'https://limits.example.invalid',
      'limits.propose',
      'limits.scope',
    );
    const oversized = changed(fixture, (manifest) => {
      manifest.app_id = 'x'.repeat(300_000);
    });
    expect(() =>
      checker(oversized, fixture.resources, fixture.identity).prepare(),
    ).toThrow(/^manifest_byte_limit$/);

    const tooManyActions = changed(fixture, (manifest) => {
      const action = (manifest.actions as Record<string, unknown>[])[0];
      manifest.actions = Array.from({ length: 257 }, () => action);
    });
    expect(() =>
      checker(tooManyActions, fixture.resources, fixture.identity).prepare(),
    ).toThrow(/^action_count_limit$/);
  });
});
