import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { build } from 'esbuild';

// Broker dependencies and every simulator identity live outside the checkout.
const temporary = await mkdtemp(join(tmpdir(), 'wago-simulator-integration-'));
const root = resolve(import.meta.dirname, '../../../../..');
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}
try {
  const flowRef = process.argv.find((argument) => argument.startsWith('--flow-ref='))?.slice('--flow-ref='.length);
  let flowSource = join(root, 'apps/plugins/wago/backend/wago-flow.service.ts');
  if (flowRef) {
    const commit = execFileSync('git', ['rev-parse', '--verify', `${flowRef}^{commit}`], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    process.stdout.write(`Testing committed flow/parser source ${commit} (read-only)\n`);
    const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', commit, '--', 'apps/plugins/wago/backend'], {
      cwd: root,
      encoding: 'utf8',
    })
      .trim()
      .split('\n');
    for (const path of paths.filter((path) => path.endsWith('.ts'))) {
      const target = join(temporary, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, execFileSync('git', ['show', `${commit}:${path}`], { cwd: root }));
    }
    flowSource = join(temporary, 'apps/plugins/wago/backend/wago-flow.service.ts');
  }
  run('npm', [
    'install',
    '--prefix',
    temporary,
    '--no-audit',
    '--no-fund',
    '--ignore-scripts',
    '--package-lock=false',
    'aedes@0.51.3',
  ]);
  await build({
    entryPoints: [join(root, 'apps/plugins/wago/cc100-runtime/src/simulator.ts')],
    outfile: join(temporary, 'simulator.cjs'),
    bundle: true,
    platform: 'node',
    target: 'node24',
  });
  run(
    'pnpm',
    ['exec', 'jest', '--config', 'apps/plugins/wago/cc100-runtime/integration/jest.config.cjs', '--runInBand'],
    {
      ...process.env,
      WAGO_INTEGRATION_TEMP: temporary,
      WAGO_INTEGRATION_FLOW_SOURCE: flowSource,
      WAGO_INTEGRATION_LIFECYCLE_ONLY: process.argv.includes('--lifecycle-only') ? '1' : '0',
    },
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
