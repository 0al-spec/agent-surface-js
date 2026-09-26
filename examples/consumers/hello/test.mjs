import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  JsonDocument,
  OfflineProposalManifest,
  OfflineSchemaResources,
} from '@0al/agent-surface';
import { greet } from './app.mjs';
import { prepareHelloValues } from './asp-values.mjs';

test('native Hello behavior works without ASP', () => {
  assert.equal(greet(), 'Hello, world!');
});

test('the consumer uses current SDK exports for offline values', () => {
  const prepared = prepareHelloValues();
  assert.equal(prepared.actionId, 'greeting.propose');
  assert.match(prepared.surfaceHash, /^sha-256:[A-Za-z0-9_-]{43}$/);
  assert.match(prepared.requestHash, /^sha-256:[A-Za-z0-9_-]{43}$/);
  assert.match(prepared.grantHash, /^sha-256:[A-Za-z0-9_-]{43}$/);
  assert.equal(prepared.dataExposure[0].source.id, 'greeting.propose');
});

test('malformed manifest is rejected before application behavior', () => {
  const prepared = prepareHelloValues();
  const invalid = new OfflineProposalManifest(
    new JsonDocument(JSON.stringify({ protocol: 'unsupported' })),
    new OfflineSchemaResources([]),
    new JsonDocument('{}'),
  );
  assert.throws(() => invalid.prepare());
  assert.ok(prepared.surfaceHash);
});
