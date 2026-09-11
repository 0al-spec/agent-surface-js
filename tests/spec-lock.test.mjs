import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock('node:fs/promises', () => ({ readFile }));

const modules = [
  'core',
  'authorization',
  'privacy',
  'evidence',
  'safe-effects',
];
const fixtures = new Map(
  modules.map((name) => [
    `drafts/modules/${name}.md`,
    Buffer.from(`pinned ${name} fixture`),
  ]),
);
const sources = [...fixtures].map(([path, bytes]) => ({
  path,
  sha256: createHash('sha256').update(bytes).digest('hex'),
}));
const lock = {
  repository: 'https://github.com/0al-spec/agent-surface',
  commit: '951871c2d55db25d35512f29cc0970c69aa5cfd9',
  profile: 'asp-jcs-sha-256',
  sources,
};
const url = (source) =>
  `https://raw.githubusercontent.com/0al-spec/agent-surface/${lock.commit}/${source.path}`;

beforeEach(() => {
  vi.resetModules();
  readFile.mockResolvedValue(JSON.stringify(lock));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (requested) => {
      const source = sources.find((entry) => url(entry) === requested);
      if (!source) throw new Error(`Unexpected source URL: ${requested}`);
      return new Response(fixtures.get(source.path));
    }),
  );
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each(
  [
    [],
    undefined,
    null,
    [sources[3]],
    [...sources, sources[0]],
    [null, ...sources.slice(1)],
  ].map((value) => ({ value })),
)('rejects incomplete or invalid source collections: %j', async ({ value }) => {
  readFile.mockResolvedValue(JSON.stringify({ ...lock, sources: value }));
  await expect(import('../scripts/check-spec-lock.mjs')).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

it.each(sources)('requires $path before any fetch', async (source) => {
  readFile.mockResolvedValue(
    JSON.stringify({
      ...lock,
      sources: sources.filter((entry) => entry !== source),
    }),
  );
  await expect(import('../scripts/check-spec-lock.mjs')).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  'duplicate',
  'unexpected path',
  'missing digest',
  'invalid digest',
])('rejects %s before any network access', async (kind) => {
  const changed = structuredClone(sources);
  if (kind === 'duplicate') changed[0] = changed[1];
  if (kind === 'unexpected path') changed[0].path = 'drafts/modules/other.md';
  if (kind === 'missing digest') delete changed[3].sha256;
  if (kind === 'invalid digest') changed[3].sha256 = 'xyz';
  readFile.mockResolvedValue(JSON.stringify({ ...lock, sources: changed }));
  await expect(import('../scripts/check-spec-lock.mjs')).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  { repository: 'https://example.com' },
  { commit: 'main' },
  { profile: 'unknown' },
])('rejects unsupported lock identity %j before fetch', async (change) => {
  readFile.mockResolvedValue(JSON.stringify({ ...lock, ...change }));
  await expect(import('../scripts/check-spec-lock.mjs')).rejects.toThrow(
    'Invalid spec lock',
  );
  expect(fetch).not.toHaveBeenCalled();
});

it('fetches and verifies every required source regardless of list order', async () => {
  readFile.mockResolvedValue(
    JSON.stringify({ ...lock, sources: [...sources].reverse() }),
  );
  await import('../scripts/check-spec-lock.mjs');
  expect(fetch).toHaveBeenCalledTimes(5);
  for (const source of sources) {
    expect(fetch).toHaveBeenCalledWith(
      url(source),
      expect.objectContaining({
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(console.log).toHaveBeenCalledWith(
      `Verified ${source.path} at ${lock.commit}`,
    );
  }
});

it.each(sources)('rejects corrupted bytes for $path', async (source) => {
  const originalFetch = fetch;
  vi.stubGlobal(
    'fetch',
    vi.fn((requested, options) =>
      requested === url(source)
        ? Promise.resolve(new Response('corrupted'))
        : originalFetch(requested, options),
    ),
  );
  await expect(import('../scripts/check-spec-lock.mjs')).rejects.toThrow(
    `Source digest mismatch: ${source.path}`,
  );
});

it('rejects unsuccessful retrieval', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('missing', { status: 404 }));
  await expect(import('../scripts/check-spec-lock.mjs')).rejects.toThrow(
    'Source retrieval failed: 404',
  );
});

it('propagates transport failure instead of accepting incomplete verification', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error('transport unavailable'));
  await expect(import('../scripts/check-spec-lock.mjs')).rejects.toThrow(
    'transport unavailable',
  );
});
