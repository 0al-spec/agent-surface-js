import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const experiment = join(root, 'experiments/offline-proposal-exchange');
const temporary = mkdtempSync(join(tmpdir(), 'asp-proposal-exchange-'));
const consumer = join(temporary, 'packed consumer with spaces');

function run(command, args, cwd) {
  const env = { ...process.env };
  delete env.npm_config_allow_scripts;
  delete env.NPM_CONFIG_ALLOW_SCRIPTS;
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`proposal_consumer_command_failed:${command}`);
  }
  return result.stdout;
}

function pack(directory) {
  const artifacts = JSON.parse(
    run('npm', ['pack', '--json', '--pack-destination', temporary], directory),
  );
  assert.equal(artifacts.length, 1);
  assert.match(artifacts[0].filename, /^[a-zA-Z0-9._-]+\.tgz$/u);
  return join(temporary, artifacts[0].filename);
}

try {
  mkdirSync(consumer);
  writeFileSync(
    join(consumer, '.npmrc'),
    'allow-scripts=\nignore-scripts=true\n',
  );
  for (const file of [
    'package.json',
    'tsconfig.json',
    'typecheck.ts',
    'check.mjs',
    'fixtures.mjs',
    'receipt-fixtures.mjs',
    'browser-entry.mjs',
  ])
    cpSync(join(experiment, 'consumer', file), join(consumer, file));
  const sdk = pack(root);
  const value = pack(experiment);
  run('npm', ['install', '--no-audit', '--no-fund', sdk, value], consumer);
  cpSync(join(experiment, 'tests/vectors.mjs'), join(consumer, 'vectors.mjs'));
  cpSync(
    join(experiment, 'tests/receipt-vectors.mjs'),
    join(consumer, 'receipt-vectors.mjs'),
  );
  cpSync(
    join(experiment, 'tests/inline-vectors.mjs'),
    join(consumer, 'inline-vectors.mjs'),
  );
  const vectors = run(
    process.execPath,
    [
      '--test',
      '--test-reporter=tap',
      'vectors.mjs',
      'receipt-vectors.mjs',
      'inline-vectors.mjs',
    ],
    consumer,
  );
  process.stdout.write(
    `${vectors
      .split('\n')
      .filter((line) => /^# (tests|pass|fail|duration_ms) /u.test(line))
      .join('\n')}\n`,
  );
  run(
    process.execPath,
    [
      join(root, 'node_modules/typescript/bin/tsc'),
      '--project',
      'tsconfig.json',
    ],
    consumer,
  );
  process.stdout.write(run(process.execPath, ['check.mjs'], consumer));
  // Node-only conditional export: reject the package at browser resolution,
  // rather than shipping a bundle with stubbed crypto/server dependencies.
  await assert.rejects(
    build({
      root: consumer,
      configFile: false,
      logLevel: 'silent',
      build: {
        write: false,
        lib: { entry: join(consumer, 'browser-entry.mjs'), formats: ['es'] },
      },
    }),
    /not exported under the conditions \[[^\]]*"browser"[^\]]*\][\s\S]*@0al\/offline-proposal-exchange-experiment/u,
  );
  console.log(
    'Browser import rejected at package boundary (not a security sandbox)',
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
