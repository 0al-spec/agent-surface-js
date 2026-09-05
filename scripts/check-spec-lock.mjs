import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const lock = JSON.parse(
  await readFile(new URL('../spec-lock.json', import.meta.url), 'utf8'),
);
if (
  lock.repository !== 'https://github.com/0al-spec/agent-surface' ||
  !/^[a-f0-9]{40}$/.test(lock.commit)
) {
  throw new Error('Invalid spec lock');
}
for (const source of lock.sources) {
  if (source.path !== 'drafts/modules/evidence.md')
    throw new Error('Unexpected source');
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
