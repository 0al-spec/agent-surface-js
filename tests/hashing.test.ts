import { describe, expect, it } from 'vitest';
import {
  CanonicalObjectHash,
  JsonDocument,
  SurfaceSnapshot,
} from '../src/index.js';

const grant = new CanonicalObjectHash(
  'https://github.com/0al-spec/agent-surface/hash/grant/v1',
);
const manifestHash = 'sha-256:Mckhl9gi8ePkXnuOJtPFNE1pe9LhilOGu1OgzxsXb8A';

describe('pinned ASP canonical object hashing vectors', () => {
  it('matches the normative Grant vector and Calcu characterization vector', () => {
    expect(
      grant.digest(
        new JsonDocument('{"grant_id":"grant_123","scopes":["read"]}'),
      ),
    ).toBe('sha-256:Xbq37_fP9PBiWI3Bv7Ch0t8TV5ikJGm55MxncSeA38Y');
    expect(grant.digest(new JsonDocument('{"b":1,"a":2}'))).toBe(
      'sha-256:Q2gjSTSPZ1b5gMFs3zIAtpqO0RHMt90sIy3TpjqFBkY',
    );
  });

  it('ignores member order, preserves array order and separates domains', () => {
    expect(grant.digest(new JsonDocument('{"b":1,"a":2}'))).toBe(
      grant.digest(new JsonDocument('{"a":2,"b":1}')),
    );
    expect(grant.digest(new JsonDocument('[1,2]'))).not.toBe(
      grant.digest(new JsonDocument('[2,1]')),
    );
    expect(grant.digest(new JsonDocument('{"a":"x","z":1}'))).not.toBe(
      manifestHash,
    );
  });

  it.each([
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"nested":{"a":1,"a":2}}',
    '-0',
    '[-0.0]',
    '1e400',
    '"\\ud800"',
    '{"\\udfff":1}',
    '{/*comment*/"a":1}',
    '{"a":1,}',
    'undefined',
    '{} {}',
  ])('rejects invalid source before hashing: %s', (source) => {
    expect(() => grant.digest(new JsonDocument(source))).toThrow();
  });

  it('preserves Unicode and extension members, including __proto__', () => {
    expect(grant.digest(new JsonDocument('"é"'))).not.toBe(
      grant.digest(new JsonDocument('"é"')),
    );
    expect(grant.digest(new JsonDocument('{"__proto__":{"x":1}}'))).not.toBe(
      grant.digest(new JsonDocument('{}')),
    );
    expect(() => grant.digest(new JsonDocument('"😀"'))).not.toThrow();
  });
});

describe('SurfaceSnapshot integrity', () => {
  it('matches the normative manifest vector and verifies its supplied hash', () => {
    expect(
      new SurfaceSnapshot(new JsonDocument('{"z":1,"a":"x"}')).hash(),
    ).toBe(manifestHash);
    expect(
      new SurfaceSnapshot(
        new JsonDocument(
          JSON.stringify({ z: 1, surface_hash: manifestHash, a: 'x' }),
        ),
      ).hash(),
    ).toBe(manifestHash);
  });

  it('rejects a mismatching supplied hash without falling back to identifiers', () => {
    expect(() =>
      new SurfaceSnapshot(
        new JsonDocument('{"surface_version":"1","surface_hash":"wrong"}'),
      ).hash(),
    ).toThrow('surface_hash_mismatch');
    expect(() =>
      new SurfaceSnapshot(new JsonDocument('{"surface_hash":null}')).hash(),
    ).toThrow('surface_hash_mismatch');
  });

  it('includes nested self-fields and unknown extensions', () => {
    const original = new SurfaceSnapshot(
      new JsonDocument('{"a":"x","z":1}'),
    ).hash();
    expect(
      new SurfaceSnapshot(
        new JsonDocument(
          '{"a":"x","z":1,"extension":{"surface_hash":"nested"}}',
        ),
      ).hash(),
    ).not.toBe(original);
    expect(
      new SurfaceSnapshot(new JsonDocument('{"__proto__":{"x":1}}')).hash(),
    ).not.toBe(new SurfaceSnapshot(new JsonDocument('{}')).hash());
  });

  it('retains immutable text even when a returned boundary value is modified', () => {
    const document = new JsonDocument('{"z":1,"a":"x"}');
    const snapshot = new SurfaceSnapshot(document);
    Object.assign(document.parse() as object, { z: 2 });
    expect(snapshot.hash()).toBe(manifestHash);
  });

  it.each(['null', '[]', '1', '"text"'])('requires an object: %s', (text) => {
    expect(() => new SurfaceSnapshot(new JsonDocument(text)).hash()).toThrow(
      'manifest_object_required',
    );
  });
});
