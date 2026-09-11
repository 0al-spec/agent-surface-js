import { describe, expect, it } from 'vitest';
import {
  JsonDocument,
  ManifestExposureDeclarations,
  SurfaceSnapshot,
} from '../src/index.js';

describe('deterministic JSON nesting capacity', () => {
  it('rejects a 20,000-level extension before recursive parsing with a safe code', () => {
    const junk = `${'['.repeat(20_000)}0${']'.repeat(20_000)}`;
    const document = new JsonDocument(
      `{"data_classes":[],"resources":[],"actions":[],"events":[],"junk":${junk}}`,
    );
    expect(() => new ManifestExposureDeclarations(document).validate()).toThrow(
      /^json_nesting_limit$/,
    );
  });

  it.each([
    ['[', ']'],
    ['{"value":', '}'],
  ])('supports 256 containers but not 257: %s', (open, close) => {
    const accepted = new JsonDocument(
      `${open.repeat(256)}0${close.repeat(256)}`,
    );
    expect(() => accepted.parse()).not.toThrow();
    const rejected = new JsonDocument(
      `${open.repeat(257)}0${close.repeat(257)}`,
    );
    expect(() => rejected.parse()).toThrow(/^json_nesting_limit$/);
    expect(() => rejected.parse()).toThrow(/^json_nesting_limit$/);
  });

  it('does not count brackets, braces or escaped quotes in string tokens', () => {
    const text = JSON.stringify({ value: '[{"'.repeat(20_000) });
    expect(new JsonDocument(text).parse()).toEqual(JSON.parse(text));
    expect(() =>
      new SurfaceSnapshot(new JsonDocument(text)).hash(),
    ).not.toThrow();
  });

  it('keeps construction inert and hashes the largest supported object', () => {
    const text = `${'{"a":'.repeat(256)}0${'}'.repeat(256)}`;
    expect(() =>
      new SurfaceSnapshot(new JsonDocument(text)).hash(),
    ).not.toThrow();
    expect(() => new JsonDocument('['.repeat(20_000))).not.toThrow();
  });

  it.each([
    '[}',
    '{]',
    ']0',
    '{"a": [} [0]]',
    '[0',
    '[0,]',
    '[/*comment*/0]',
  ])('does not repair malformed brackets or JSON: %s', (text) => {
    expect(() => new JsonDocument(text).parse()).toThrow(/^invalid_json$/);
  });
});
