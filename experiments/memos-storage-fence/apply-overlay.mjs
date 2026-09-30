import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const baseline = '2b2192d4e153bd04f1d325b60fd880cf00d68b01';
const target = process.argv[2];
if (!target) throw new Error('Provide an isolated clean Memos checkout path');
const cwd = resolve(target);
const git = (...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
if (git('rev-parse', 'HEAD') !== baseline)
  throw new Error('Wrong Memos baseline');
if (git('status', '--porcelain'))
  throw new Error('Refusing to modify a dirty checkout');
const root = fileURLToPath(new URL('./overlay/', import.meta.url));
const files = [
  'store/db/sqlite/asp_nonlive_fence.go',
  'store/db/sqlite/asp_nonlive_fence_test.go',
];
for (const file of files) {
  const source = resolve(root, file);
  if (
    !readFileSync(source, 'utf8').startsWith('//go:build asp_nonlive_fence\n')
  ) {
    throw new Error('Overlay must remain opt-in build-tagged');
  }
  if (existsSync(resolve(cwd, file)))
    throw new Error('Refusing to overwrite existing files');
}
for (const file of files) copyFileSync(resolve(root, file), resolve(cwd, file));
console.log(
  'Applied two opt-in files to isolated pinned Memos checkout; no routes activated.',
);
