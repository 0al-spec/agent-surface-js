import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const example = join(root, 'examples/consumers/hello');
const temporary = mkdtempSync(join(tmpdir(), 'asp-hello-consumer-'));
const consumer = join(temporary, 'consumer');

function run(command, args, cwd) {
  const environment = { ...process.env };
  // `npm run` forwards this user-level allow-list into child npm processes;
  // the isolated install instead relies on its local ignore-scripts policy.
  delete environment.npm_config_allow_scripts;
  delete environment.NPM_CONFIG_ALLOW_SCRIPTS;
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: environment,
    maxBuffer: 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`consumer_command_failed:${command}`);
  }
  return result.stdout;
}

try {
  mkdirSync(consumer);
  // The package has no install scripts; keep installation inert and override
  // only the temporary consumer's project-level policy, not the user's config.
  writeFileSync(
    join(consumer, '.npmrc'),
    'allow-scripts=\nignore-scripts=true\n',
  );
  for (const file of ['package.json', 'app.mjs', 'asp-values.mjs', 'test.mjs'])
    cpSync(join(example, file), join(consumer, file));

  const packed = JSON.parse(
    run('npm', ['pack', '--json', '--pack-destination', temporary], root),
  );
  if (!Array.isArray(packed) || typeof packed[0]?.filename !== 'string')
    throw new Error('consumer_package_artifact_missing');

  const tarball = join(temporary, packed[0].filename);
  run('npm', ['install', '--no-audit', '--no-fund', tarball], consumer);
  process.stdout.write(run('npm', ['run', 'check'], consumer));
  process.stdout.write(run('npm', ['run', 'run'], consumer));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
