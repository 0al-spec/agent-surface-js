import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CanonicalObjectHash,
  JsonDocument,
  SurfaceSnapshot,
} from '../src/index.js';

describe('reviewed merged ASP source revision, not runtime support', () => {
  it('pins the reviewed merged revision and complete module bytes for the Hello fixture', () => {
    const lock = new JsonDocument(
      readFileSync(new URL('../spec-lock.json', import.meta.url), 'utf8'),
    );
    expect(lock.parse()).toEqual({
      repository: 'https://github.com/0al-spec/agent-surface',
      commit: 'da550fde6f8be4ff0c1ded15524afb66c2912287',
      profile: 'asp-jcs-sha-256',
      sources: [
        {
          path: 'drafts/modules/core.md',
          sha256:
            'ec35cebe1b1fb718d7dc3c4c5b03350dd808e896842c97b165a3bf91f8814659',
        },
        {
          path: 'drafts/modules/authorization.md',
          sha256:
            '463cfad1fb88ae97f2d496a9f61a27589885a7a07b85db1c0612a7a4feb5269d',
        },
        {
          path: 'drafts/modules/privacy.md',
          sha256:
            '0b7b2021377405de19fd630c93dde64d47564d8b22435b93c42445b62528f011',
        },
        {
          path: 'drafts/modules/evidence.md',
          sha256:
            'f1beadacad07818cc97e6101d167fa67697bc5b96a7a660e43a9e87a828ca2a3',
        },
        {
          path: 'drafts/modules/safe-effects.md',
          sha256:
            '8d6566cd5864d64db5cff802b501a14b27965d74887eeab8461adf877183209e',
        },
      ],
    });
  });
});

// Host-binding source-compatibility fragments only: these are not complete
// operational manifests or Grants and provide no issuer/authority qualification.
// Goldens are independently derived from ASCII-only strings/objects with
// sorted compact JSON, SHA-256 and unpadded base64url over { domain, object }.
const manifestAuthDescriptor = {
  type: 'https://github.com/0al-spec/agent-surface/profiles/host-provisioned-bearer/v1',
  credential_profile: 'compatibility_bearer',
};
const grantCredentialBinding = {
  credential_profile: 'compatibility_bearer',
  credential_binding: { method: 'bearer' },
};
const manifestAuthHash = 'sha-256:BqSx3apwR59H6V7R5_0_JRuxv7BzmNGwPHY7TtVg5uo';
const grantCredentialBindingHash =
  'sha-256:FOxmVDnMoyPkD3Pme1ZwLf0idzV-ffvttmvB1WwXVDo';
const manifestHashDomain =
  'https://github.com/0al-spec/agent-surface/hash/manifest/v1';
const grantHashDomain =
  'https://github.com/0al-spec/agent-surface/hash/grant/v1';

function json(value: unknown): JsonDocument {
  return new JsonDocument(JSON.stringify(value));
}

describe('host-provisioned bearer hashing fragments, not operational validation', () => {
  it('matches independently derived manifest auth-descriptor and Grant binding goldens', () => {
    expect(
      new CanonicalObjectHash(manifestHashDomain).digest(
        json(manifestAuthDescriptor),
      ),
    ).toBe(manifestAuthHash);
    expect(
      new CanonicalObjectHash(grantHashDomain).digest(
        json(grantCredentialBinding),
      ),
    ).toBe(grantCredentialBindingHash);
  });

  it.each([
    ['compatibility_bearer', { method: 'compatibility_bearer' }],
    ['Bearer', { method: 'Bearer' }],
    ['omitted', {}],
  ])('changes the Grant fragment digest for %s without semantic rejection', (_label, credentialBinding) => {
    // Generic CanonicalObjectHash can hash these invalid/missing methods;
    // this characterization does not provide a Grant validator.
    const changed = {
      ...grantCredentialBinding,
      credential_binding: credentialBinding,
    };
    let digest: string | undefined;
    expect(() => {
      digest = new CanonicalObjectHash(grantHashDomain).digest(json(changed));
    }).not.toThrow();
    expect(digest).not.toBe(grantCredentialBindingHash);
  });
});

// Selected hashing-view fragments, not complete manifests or Grants.
// Independent ASCII-only golden derivation is documented in the compatibility note.
const exposure = {
  classes: [],
  redaction: { mode: 'none' },
  retention: { mode: 'user_managed' },
};
const manifestHash = 'sha-256:KzqbtQPsYxDP5r1dYxK1KOMXhV1PKZ6tVQcqA6Hs9t8';
const grantHash = 'sha-256:CVFyk3LKCZbZLS1u0elDjuSiM6OrTOSeDiRh0FbEIio';

describe('user-managed hashing compatibility, not retention validation', () => {
  it('preserves the exact closed mode in manifest and Grant hashing views', () => {
    expect(
      new SurfaceSnapshot(
        new JsonDocument(JSON.stringify({ data_exposure: exposure })),
      ).hash(),
    ).toBe(manifestHash);
    expect(
      new CanonicalObjectHash(
        'https://github.com/0al-spec/agent-surface/hash/grant/v1',
      ).digest(
        new JsonDocument(
          JSON.stringify({
            data_exposure: [
              {
                source: { kind: 'action', id: 'greeting.propose' },
                ...exposure,
              },
            ],
          }),
        ),
      ),
    ).toBe(grantHash);
  });

  it.each([
    null,
    {},
    { mode: 'unknown' },
    { mode: 'transient', delete_on_grant_end: true },
    { mode: 'user_managed', delete_on_grant_end: false },
    { mode: 'user_managed', max_seconds: 60 },
  ])('does not preserve an old manifest or Grant hash after changing retention: %j', (retention) => {
    const changed = { ...exposure, retention };
    expect(() =>
      new SurfaceSnapshot(
        new JsonDocument(
          JSON.stringify({
            data_exposure: changed,
            surface_hash: manifestHash,
          }),
        ),
      ).hash(),
    ).toThrow('surface_hash_mismatch');
    expect(
      new CanonicalObjectHash(
        'https://github.com/0al-spec/agent-surface/hash/grant/v1',
      ).digest(
        new JsonDocument(
          JSON.stringify({
            data_exposure: [
              {
                source: { kind: 'action', id: 'greeting.propose' },
                ...changed,
              },
            ],
          }),
        ),
      ),
    ).not.toBe(grantHash);
  });

  it('binds omission without supplying a default mode', () => {
    expect(() =>
      new SurfaceSnapshot(
        new JsonDocument(
          JSON.stringify({
            data_exposure: { classes: [], redaction: { mode: 'none' } },
            surface_hash: manifestHash,
          }),
        ),
      ).hash(),
    ).toThrow('surface_hash_mismatch');
  });
});
