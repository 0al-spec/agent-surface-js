import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const lock = JSON.parse(
  await readFile(new URL('../spec-lock.json', import.meta.url), 'utf8'),
);
const requiredSources = [
  'drafts/modules/core.md',
  'drafts/modules/authorization.md',
  'drafts/modules/privacy.md',
  'drafts/modules/evidence.md',
];
if (
  lock.repository !== 'https://github.com/0al-spec/agent-surface' ||
  lock.profile !== 'asp-jcs-sha-256' ||
  typeof lock.commit !== 'string' ||
  !/^[a-f0-9]{40}$/.test(lock.commit)
) {
  throw new Error('Invalid spec lock');
}
if (
  !Array.isArray(lock.sources) ||
  lock.sources.length !== requiredSources.length ||
  !lock.sources.every(
    (source) =>
      source !== null &&
      typeof source === 'object' &&
      requiredSources.includes(source.path) &&
      typeof source.sha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(source.sha256),
  ) ||
  new Set(lock.sources.map((source) => source.path)).size !==
    requiredSources.length
) {
  throw new Error(
    'Spec lock must contain exactly Core, Authorization, Privacy and Evidence with SHA-256 digests',
  );
}
for (const source of lock.sources) {
  const response = await fetch(
    `https://raw.githubusercontent.com/0al-spec/agent-surface/${lock.commit}/${source.path}`,
    {
      signal: AbortSignal.timeout(30_000),
      redirect: 'error',
    },
  );
  if (!response.ok)
    throw new Error(`Source retrieval failed: ${response.status}`);
  const hash = createHash('sha256')
    .update(Buffer.from(await response.arrayBuffer()))
    .digest('hex');
  if (hash !== source.sha256)
    throw new Error(`Source digest mismatch: ${source.path}`);
  console.log(`Verified ${source.path} at ${lock.commit}`);
}
