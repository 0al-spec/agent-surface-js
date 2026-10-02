import { describe, expect, it } from 'vitest';
import {
  type ActionInput,
  OfflineActionInventory,
} from '../src/authoring/index.js';
import { CanonicalObjectHash } from '../src/canonical-object-hash.js';
import type { PreparedOfflineProposalManifest } from '../src/offline-proposal-manifest.js';
import {
  base,
  calculation,
  classes,
  composed,
  greeting,
  json,
} from './fixtures/authoring.js';
import {
  type FixtureAccess,
  FixtureDispatchDomain,
  FixtureHandlerBinding,
} from './fixtures/proposal-dispatch-model.js';

type Calculation = ActionInput<ReturnType<typeof calculation>>;
const input = { operator: 'multiply', left: 240, right: 0.15 };
const INPUT_DOMAIN =
  'https://github.com/0al-spec/agent-surface/hash/action-input/v1';

function arithmetic(value: Calculation) {
  let result: number;
  switch (value.operator) {
    case 'add':
      result = value.left + value.right;
      break;
    case 'subtract':
      result = value.left - value.right;
      break;
    case 'multiply':
      result = value.left * value.right;
      break;
    case 'divide':
      result = value.left / value.right;
      break;
    default:
      throw new Error('domain_invalid');
  }
  if (!Number.isFinite(result)) throw new Error('invalid_result');
  return { ...value, result: Object.is(result, -0) ? 0 : result };
}

function fixture() {
  const inventory = new OfflineActionInventory(classes, [
    calculation(),
  ]).prepare(base);
  const manifest = composed(inventory).prepare();
  const domain = new FixtureDispatchDomain();
  const selection = {
    action_id: manifest.actionId,
    mode: 'propose' as const,
    surface_hash: manifest.hash(),
  };
  let handler = (value: Calculation): unknown => arithmetic(value);
  let decode = (
    document: Parameters<PreparedOfflineProposalManifest['validateInput']>[1],
  ) => document.parse() as Calculation;
  const binding = new FixtureHandlerBinding(
    manifest,
    selection,
    (document) => decode(document),
    (value) => handler(value),
  );
  const executor = binding.prepare(domain);
  const access = domain.provision(manifest.hash());
  const request = (value: unknown = input) => ({
    type: 'action.request',
    payload: {
      binding: domain.tuple(access),
      action_id: manifest.actionId,
      mode: 'propose',
      input: structuredClone(value),
      input_hash: new CanonicalObjectHash(INPUT_DOMAIN).digest(json(value)),
    },
  });
  return {
    manifest,
    domain,
    selection,
    binding,
    executor,
    access,
    request,
    handler: (next: typeof handler) => {
      handler = next;
    },
    decode: (next: typeof decode) => {
      decode = next;
    },
  };
}

describe('P5-T9A private synchronous dispatch seam (not ASP conformance)', () => {
  it('prepares without invoking or provisioning; exposes only independent invoke', () => {
    const state = fixture();
    const emptyDomain = new FixtureDispatchDomain();
    const prepared = state.binding.prepare(emptyDomain);
    expect(emptyDomain.observe()).toEqual({
      issued: 0,
      entries: 0,
      remaining: undefined,
    });
    expect(Object.keys(prepared)).toEqual(['invoke']);
    expect(() =>
      prepared.invoke(state.access, JSON.stringify(state.request())),
    ).toThrow('unauthorized');
    expect(state.domain.observe(state.access).entries).toBe(0);
  });

  it('executes one correlated schema-validated proposal through real SDK manifest checks', () => {
    const state = fixture();
    const outcome = state.executor.invoke(
      state.access,
      JSON.stringify(state.request()),
    );
    expect(outcome.output.parse()).toEqual({ ...input, result: 36 });
    expect(outcome.action_id).toBe('calculation.propose');
    expect(outcome.input_hash).toBe(state.request().payload.input_hash);
    expect(outcome.output_hash).toMatch(/^sha-256:/);
    expect(state.domain.observe(state.access)).toEqual({
      issued: 1,
      entries: 1,
      remaining: 0,
    });
  });

  it('rejects a missing trusted dispatch dependency during preparation', () => {
    const state = fixture();
    expect(() =>
      state.binding.prepare(undefined as unknown as FixtureDispatchDomain),
    ).toThrow('dispatch_domain_missing');
    expect(state.domain.observe(state.access).entries).toBe(0);
  });

  it.each([
    'action',
    'mode',
    'snapshot',
    'missing-handler',
    'fake-manifest',
  ])('rejects %s preparation without entry', (kind) => {
    const state = fixture();
    const selection = { ...state.selection };
    if (kind === 'action') selection.action_id = 'sqrt';
    if (kind === 'mode') Object.assign(selection, { mode: 'commit' });
    if (kind === 'snapshot') selection.surface_hash = 'changed';
    const manifest =
      kind === 'fake-manifest'
        ? ({
            ...state.manifest,
            hash: () => state.manifest.hash(),
          } as PreparedOfflineProposalManifest)
        : state.manifest;
    const handler =
      kind === 'missing-handler'
        ? (undefined as unknown as typeof arithmetic)
        : arithmetic;
    const candidate = new FixtureHandlerBinding(
      manifest,
      selection,
      (document) => document.parse() as Calculation,
      handler,
    );
    expect(() => candidate.prepare(state.domain)).toThrow();
    expect(state.domain.observe(state.access).entries).toBe(0);
  });

  it.each([
    'subject',
    'runtime',
    'agent',
    'audience',
    'grant_id',
    'session_generation',
    'surface_hash',
  ])('rejects caller-changed %s before entry', (key) => {
    const state = fixture();
    const request = state.request();
    Object.assign(request.payload.binding, { [key]: 'changed' });
    expect(() =>
      state.executor.invoke(state.access, JSON.stringify(request)),
    ).toThrow('binding_mismatch');
    expect(state.domain.observe(state.access).entries).toBe(0);
  });

  it.each([
    'action',
    'mode',
    'input-hash',
    'extra-input',
    'sqrt',
    'admitted-flag',
    'credential-body',
  ])('rejects %s request despite a retained manifest', (kind) => {
    const state = fixture();
    const request = state.request();
    if (kind === 'action') request.payload.action_id = 'other.propose';
    if (kind === 'mode') request.payload.mode = 'commit';
    if (kind === 'input-hash') request.payload.input_hash = 'changed';
    if (kind === 'extra-input')
      request.payload.input = { ...input, credential: 'caller' };
    if (kind === 'sqrt') request.payload.input = { ...input, operator: 'sqrt' };
    if (kind === 'admitted-flag')
      Object.assign(request.payload, { admitted: true });
    if (kind === 'credential-body')
      Object.assign(request, { credential: 'caller' });
    expect(() =>
      state.executor.invoke(state.access, JSON.stringify(request)),
    ).toThrow();
    expect(state.domain.observe(state.access).entries).toBe(0);
  });

  it.each([
    'malformed',
    'duplicate-key',
    'oversized',
    'negative-zero',
  ])('rejects %s raw input before entry', (kind) => {
    const state = fixture();
    const valid = JSON.stringify(state.request());
    const source = {
      malformed: '{',
      'duplicate-key': valid.replace('"left":240', '"left":240,"left":1'),
      oversized: ' '.repeat(8193),
      'negative-zero': valid.replace('"left":240', '"left":-0'),
    }[kind];
    expect(() => state.executor.invoke(state.access, source ?? '')).toThrow();
    expect(state.domain.observe(state.access).entries).toBe(0);
  });

  it('does not manufacture authority through a cast, another host or prior schema success', () => {
    const state = fixture();
    state.manifest.validateInput(state.manifest.actionId, json(input));
    const source = JSON.stringify(state.request());
    expect(() =>
      state.executor.invoke({ ...state.access } as FixtureAccess, source),
    ).toThrow('unauthorized');
    const other = new FixtureDispatchDomain();
    expect(() =>
      state.executor.invoke(other.provision(state.manifest.hash()), source),
    ).toThrow('unauthorized');
    state.domain.revoke(state.access);
    expect(() => state.executor.invoke(state.access, source)).toThrow(
      'unauthorized',
    );
    expect(state.domain.observe(state.access).entries).toBe(0);
  });

  it.each([
    'expiry',
    'identity-expiry',
    'identity-revoked',
    'identity-unavailable',
    'revoke',
    'rotate',
    'retire',
    'cancel',
  ])('rechecks %s after synchronous verifier re-entry', (kind) => {
    const state = fixture();
    const controller = new AbortController();
    const source = JSON.stringify(state.request());
    let verified = false;
    state.domain.duringVerification(() => {
      verified = true;
      if (kind === 'expiry') state.domain.advanceTo(60);
      if (kind === 'identity-expiry') {
        state.domain.identity(state.access, 'active', 10);
        state.domain.advanceTo(20);
      }
      if (kind === 'identity-revoked')
        state.domain.identity(state.access, 'revoked');
      if (kind === 'identity-unavailable')
        state.domain.identity(state.access, 'unavailable');
      if (kind === 'revoke') state.domain.revoke(state.access);
      if (kind === 'rotate') state.domain.rotate(state.access);
      if (kind === 'retire') state.domain.retire();
      if (kind === 'cancel') controller.abort();
    });
    expect(() =>
      state.executor.invoke(state.access, source, controller.signal),
    ).toThrow();
    expect(verified).toBe(true);
    expect(state.domain.observe(state.access).entries).toBe(0);
    expect(state.domain.observe(state.access).remaining).toBe(1);
  });

  it('also fences trusted domain decoding before entry', () => {
    const state = fixture();
    state.decode((document) => {
      state.domain.revoke(state.access);
      return document.parse() as Calculation;
    });
    expect(() =>
      state.executor.invoke(state.access, JSON.stringify(state.request())),
    ).toThrow('unauthorized');
    expect(state.domain.observe(state.access).entries).toBe(0);
  });

  it('captures and freezes admitted domain input without freezing caller-owned values', () => {
    const state = fixture();
    const owned = { ...input };
    let received: Calculation | undefined;
    state.domain.duringVerification(() => {
      owned.left = 111;
    });
    state.handler((value) => {
      received = value;
      expect(Object.isFrozen(value)).toBe(true);
      return arithmetic(value);
    });
    const source = JSON.stringify(state.request(owned));
    expect(state.executor.invoke(state.access, source).output.parse()).toEqual({
      ...input,
      result: 36,
    });
    expect(received).toEqual(input);
    expect(owned.left).toBe(111);
    expect(Object.isFrozen(owned)).toBe(false);
  });

  it('does not freeze a trusted decoder-owned value', () => {
    const state = fixture();
    const owned = { ...input };
    state.decode(() => owned);
    state.executor.invoke(state.access, JSON.stringify(state.request()));
    expect(Object.isFrozen(owned)).toBe(false);
  });

  it('does not retain a caller-mutable selection after construction', () => {
    const state = fixture();
    const selection = { ...state.selection };
    const candidate = new FixtureHandlerBinding(
      state.manifest,
      selection,
      (document) => document.parse() as Calculation,
      arithmetic,
    );
    selection.action_id = 'sqrt';
    selection.surface_hash = 'changed';
    const prepared = candidate.prepare(state.domain);
    expect(
      prepared
        .invoke(state.access, JSON.stringify(state.request()))
        .output.parse(),
    ).toEqual({ ...input, result: 36 });
    expect(selection.action_id).toBe('sqrt');
    expect(Object.isFrozen(selection)).toBe(false);
  });

  it.each([
    0,
    -1,
    NaN,
    Infinity,
    0.5,
  ])('rejects invalid trusted quota %s before provisioning', (quota) => {
    const state = fixture();
    const domain = new FixtureDispatchDomain();
    expect(() => domain.provision(state.manifest.hash(), quota)).toThrow(
      'quota_invalid',
    );
    expect(domain.observe().issued).toBe(0);
  });

  it('keeps quota across prepared compositions and claims before re-entrant requests', () => {
    const state = fixture();
    const other = state.binding.prepare(state.domain);
    const source = JSON.stringify(state.request());
    state.handler((value) => {
      expect(() => other.invoke(state.access, source)).toThrow(
        'quota_exceeded',
      );
      return arithmetic(value);
    });
    state.executor.invoke(state.access, source);
    expect(() => other.invoke(state.access, source)).toThrow('quota_exceeded');
    expect(state.domain.observe(state.access).entries).toBe(1);
  });

  it('records a limit: output schema alone does not establish application correlation', () => {
    const state = fixture();
    state.handler(() => ({
      operator: 'multiply',
      left: 111,
      right: 2,
      result: 222,
    }));
    const outcome = state.executor.invoke(
      state.access,
      JSON.stringify(state.request()),
    );
    expect(outcome.output.parse()).toEqual({
      operator: 'multiply',
      left: 111,
      right: 2,
      result: 222,
    });
    expect(outcome.input_hash).toBe(state.request().payload.input_hash);
    expect(state.domain.observe(state.access).entries).toBe(1);
    // A Calcu mediator must reject this response. This candidate is NOT a
    // mediator and its hashes/schema checks do not establish business truth.
  });

  it.each([
    'throw',
    'invalid-output',
    'async-output',
    'cancelled-delivery',
  ])('counts %s as entered, without quota refund or automatic retry', (kind) => {
    const state = fixture();
    const controller = new AbortController();
    state.handler((value) => {
      if (kind === 'throw') throw new Error('business_failed');
      if (kind === 'invalid-output') return { ...value, result: '36' };
      if (kind === 'async-output') return Promise.resolve(arithmetic(value));
      controller.abort();
      return arithmetic(value);
    });
    const source = JSON.stringify(state.request());
    expect(() =>
      state.executor.invoke(state.access, source, controller.signal),
    ).toThrow();
    expect(state.domain.observe(state.access)).toMatchObject({
      entries: 1,
      remaining: 0,
    });
    expect(() =>
      state.binding.prepare(state.domain).invoke(state.access, source),
    ).toThrow('quota_exceeded');
    expect(state.domain.observe(state.access).entries).toBe(1);
  });

  it('reuses the same private composition with a separate greeting proposal manifest', () => {
    const inventory = new OfflineActionInventory(classes, [greeting()]).prepare(
      base,
    );
    const manifest = composed(inventory, 'greeting-fixture-1').prepare();
    const domain = new FixtureDispatchDomain();
    const nativeGreeting = () => ({ greeting: 'Hello, world!' });
    const binding = new FixtureHandlerBinding(
      manifest,
      {
        action_id: manifest.actionId,
        mode: 'propose',
        surface_hash: manifest.hash(),
      },
      (document) => document.parse(),
      nativeGreeting,
    );
    const executor = binding.prepare(domain);
    expect(domain.observe().issued).toBe(0);
    const access = domain.provision(manifest.hash());
    const request = {
      type: 'action.request',
      payload: {
        binding: domain.tuple(access),
        action_id: manifest.actionId,
        mode: 'propose',
        input: {},
        input_hash: new CanonicalObjectHash(INPUT_DOMAIN).digest(json({})),
      },
    };
    expect(
      executor.invoke(access, JSON.stringify(request)).output.parse(),
    ).toEqual(nativeGreeting());
    expect(domain.observe(access).entries).toBe(1);
    domain.retire();
    expect(() => executor.invoke(access, JSON.stringify(request))).toThrow(
      'unauthorized',
    );
    expect(domain.observe(access).entries).toBe(1);
    expect(nativeGreeting()).toEqual({ greeting: 'Hello, world!' }); // Native route stays independent.
  });

  it('keeps all fixture classes absent from public entry points', async () => {
    for (const module of [
      await import('../src/index.js'),
      await import('../src/authoring/index.js'),
    ]) {
      expect(module).not.toHaveProperty('FixtureHandlerBinding');
      expect(module).not.toHaveProperty('FixtureDispatchDomain');
    }
  });
});
