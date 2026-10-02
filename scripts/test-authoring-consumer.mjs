import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(join(tmpdir(), 'asp-authoring-consumer-'));
const fixture = join(root, 'examples/consumers/authoring');
const compiler = join(root, 'node_modules/typescript/bin/tsc');

function run(command, args, cwd) {
  const env = { ...process.env };
  delete env.npm_config_allow_scripts;
  delete env.NPM_CONFIG_ALLOW_SCRIPTS;
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`authoring_consumer_command_failed:${command}`);
  }
  return result.stdout;
}

try {
  const packed = JSON.parse(
    run('npm', ['pack', '--json', '--pack-destination', temporary], root),
  );
  if (!Array.isArray(packed) || typeof packed[0]?.filename !== 'string')
    throw new Error('consumer_package_artifact_missing');
  const tarball = join(temporary, packed[0].filename);
  for (const variant of ['root-only', 'consumer']) {
    const cwd = join(temporary, `${variant} with spaces`);
    mkdirSync(cwd);
    writeFileSync(join(cwd, '.npmrc'), 'allow-scripts=\nignore-scripts=true\n');
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({ private: true, type: 'module' }),
    );
    writeFileSync(
      join(cwd, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
          skipLibCheck: false,
          types: [],
          outDir: 'out',
        },
        include: ['*.ts'],
      }),
    );
    cpSync(join(fixture, `${variant}.ts`), join(cwd, 'consumer.ts'));
    const peers = variant === 'consumer' ? ['@sinclair/typebox@0.34.52'] : [];
    run('npm', ['install', '--no-audit', '--no-fund', tarball, ...peers], cwd);
    if (variant === 'root-only') {
      run(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
        import { createRequire } from 'node:module';
        const require = createRequire(import.meta.url);
        try { require.resolve('@sinclair/typebox'); throw new Error('optional_peer_was_installed'); }
        catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
      `,
        ],
        cwd,
      );
    }
    run(process.execPath, [compiler, '--project', 'tsconfig.json'], cwd);
    process.stdout.write(run(process.execPath, ['out/consumer.js'], cwd));
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
