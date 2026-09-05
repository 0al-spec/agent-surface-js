import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock('node:fs/promises', () => ({ readFile }));

const bytes = Buffer.from('pinned evidence fixture');
const source = {
  path: 'drafts/modules/evidence.md',
  sha256: createHash('sha256').update(bytes).digest('hex'),
};
const lock = {
  repository: 'https://github.com/0al-spec/agent-surface',
  commit: '951871c2d55db25d35512f29cc0970c69aa5cfd9',
  profile: 'asp-jcs-sha-256',
  sources: [source],
};

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(bytes)),
  );
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each(
  [[], undefined, null, [source, source], [{ path: 'other.md' }]].map(
    (sources) => ({ sources }),
  ),
)('rejects missing or invalid evidence sources before fetching: %j', async ({
  sources,
}) => {
  readFile.mockResolvedValue(JSON.stringify({ ...lock, sources }));
  await expect(import('../scripts/check-spec-lock.mjs')).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

it('fetches and verifies the required evidence source', async () => {
  readFile.mockResolvedValue(JSON.stringify(lock));
  await import('../scripts/check-spec-lock.mjs');
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    `https://raw.githubusercontent.com/0al-spec/agent-surface/${lock.commit}/${source.path}`,
    expect.objectContaining({ redirect: 'error' }),
  );
  expect(console.log).toHaveBeenCalledWith(
    `Verified ${source.path} at ${lock.commit}`,
  );
});

it('rejects evidence bytes that do not match the lock', async () => {
  readFile.mockResolvedValue(JSON.stringify(lock));
  vi.mocked(fetch).mockResolvedValue(new Response('different evidence'));
  await expect(import('../scripts/check-spec-lock.mjs')).rejects.toThrow(
    'Source digest mismatch',
  );
});
