import assert from 'node:assert/strict';
import {
  JsonDocument,
  OfflineSchemaResources,
  SurfaceSnapshot,
} from '@0al/agent-surface';

assert.match(new SurfaceSnapshot(new JsonDocument('{}')).hash(), /^sha-256:/);

const uri = 'https://schemas.example.test/amount';
const resources = new OfflineSchemaResources([
  {
    uri,
    document: new JsonDocument(
      '{"$id":"https://schemas.example.test/amount","$schema":"https://json-schema.org/draft/2020-12/schema","type":"string"}',
    ),
  },
]).prepare();
// Independent golden: ASCII JCS-ordered domain/object wrapper, SHA-256/base64url.
const schema = resources.resolveInput(
  uri,
  'sha-256:4dd_8S-bsbC5sKemmFALn8oJhkUb-tYlIIe93EY3agU',
);
schema.validate(new JsonDocument('"accepted"'));
assert.throws(() => schema.validate(new JsonDocument('42')));
assert.throws(() => resources.resolve(`${uri}/missing`));
console.log('Built package hashing and offline schema exports verified');
