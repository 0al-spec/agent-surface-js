import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CanonicalObjectHash,
  JsonDocument,
  SurfaceSnapshot,
} from '../src/index.js';

describe('reviewed user-managed source revision, not runtime support', () => {
  it('pins the reviewed revision and complete module bytes for the Hello fixture', () => {
    const lock = new JsonDocument(
      readFileSync(new URL('../spec-lock.json', import.meta.url), 'utf8'),
    );
    expect(lock.parse()).toEqual({
      repository: 'https://github.com/0al-spec/agent-surface',
      commit: 'b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691',
      profile: 'asp-jcs-sha-256',
      sources: [
        {
          path: 'drafts/modules/core.md',
          sha256:
            '38f8a0f6dc437a3e4b642409fe53c9853fcb62f85897c097936f7114e5ea6131',
        },
        {
          path: 'drafts/modules/authorization.md',
          sha256:
            '00fdc53ccda7545234668c43cbcbc8d29284ed442063b40747ca725cabfb652c',
        },
        {
          path: 'drafts/modules/privacy.md',
          sha256:
            'c68a7855134b2b7e054521f57c34da8d1bbd49b2cb0a019ff922117692a85566',
        },
        {
          path: 'drafts/modules/evidence.md',
          sha256:
            '3d533d71233a7f480653b61d70d67b13a87324f78aeb53d5eb27685db0056be6',
        },
      ],
    });
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
