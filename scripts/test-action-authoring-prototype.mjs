import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const experiment = join(root, 'experiments/offline-action-authoring');
const fixture = join(experiment, 'consumer');
const temporary = mkdtempSync(join(tmpdir(), 'asp-action-authoring-'));
const consumer = join(temporary, 'consumer fixture');

function run(command, args, cwd, maxBuffer = 1024 * 1024) {
  const environment = { ...process.env };
  delete environment.npm_config_allow_scripts;
  delete environment.NPM_CONFIG_ALLOW_SCRIPTS;
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: environment,
    maxBuffer,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`prototype_command_failed:${command}`);
  }
  return result.stdout;
}

function pack(directory) {
  const packed = JSON.parse(
    run('npm', ['pack', '--json', '--pack-destination', temporary], directory),
  );
  if (!Array.isArray(packed) || typeof packed[0]?.filename !== 'string')
    throw new Error('prototype_package_artifact_missing');
  return join(temporary, packed[0].filename);
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
  ])
    cpSync(join(fixture, file), join(consumer, file));

  const sdkTarball = pack(root);
  const prototypeTarball = pack(experiment);
  run(
    'npm',
    ['install', '--no-audit', '--no-fund', sdkTarball, prototypeTarball],
    consumer,
    2 * 1024 * 1024,
  );
  const compiler = join(root, 'node_modules/typescript/bin/tsc');
  run(process.execPath, [compiler, '--project', 'tsconfig.json'], consumer);
  process.stdout.write(run('npm', ['run', 'check'], consumer));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
