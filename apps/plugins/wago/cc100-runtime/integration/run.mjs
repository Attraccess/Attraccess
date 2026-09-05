import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
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
function argument(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}
async function snapshot(ref, label, directories) {
  const commit = execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  process.stdout.write(`Testing committed ${label} source ${commit} (read-only)\n`);
  const destination = join(temporary, label);
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', commit, '--', ...directories], {
    cwd: root,
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
  for (const path of paths.filter((path) => path.endsWith('.ts'))) {
    const target = join(destination, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, execFileSync('git', ['show', `${commit}:${path}`], { cwd: root }));
  }
  return destination;
}
try {
  const backend = 'apps/plugins/wago/backend';
  const measurementContract = 'apps/plugins/wago/measurement-contract.ts';
  const modbus = 'apps/plugins/wago/modbus';
  const runtime = 'apps/plugins/wago/cc100-runtime';
  const flowRoot = argument('flow-ref')
    ? await snapshot(argument('flow-ref'), 'flow', [backend, measurementContract])
    : root;
  const mainRoot = argument('main-ref')
    ? await snapshot(argument('main-ref'), 'main', [runtime, backend, measurementContract, modbus])
    : root;
  const runtimeRoot = argument('runtime-ref')
    ? await snapshot(argument('runtime-ref'), 'runtime', [runtime, backend, measurementContract, modbus])
    : root;
  for (const stagedRoot of [...new Set([mainRoot, runtimeRoot])].filter((sourceRoot) => sourceRoot !== root)) {
    await symlink(join(root, 'node_modules'), join(stagedRoot, 'node_modules'), 'dir');
    // Only the owned entrypoint/device are overlaid. Runtime modules are exact git blobs.
    for (const file of ['simulator.ts', 'simulator-device.ts'])
      await writeFile(join(stagedRoot, runtime, 'src', file), await readFile(join(root, runtime, 'src', file)));
    const config = join(stagedRoot, 'tsconfig.simulator.json');
    await writeFile(
      config,
      JSON.stringify({
        extends: join(root, 'tsconfig.base.json'),
        compilerOptions: { rootDir: '/', types: ['node'], typeRoots: [join(root, 'node_modules/@types')] },
        include: [`${runtime}/src/simulator.ts`, `${runtime}/src/simulator-device.ts`],
      }),
    );
    run('pnpm', ['exec', 'tsc', '--noEmit', '-p', config]);
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
  for (const [sourceRoot, file] of [
    [runtimeRoot, 'simulator.cjs'],
    [mainRoot, 'main-simulator.cjs'],
  ])
    await build({
      entryPoints: [join(sourceRoot, runtime, 'src/simulator.ts')],
      outfile: join(temporary, file),
      bundle: true,
      platform: 'node',
      target: 'node24',
      nodePaths: [join(root, 'node_modules')],
    });
  run(
    'pnpm',
    ['exec', 'jest', '--config', 'apps/plugins/wago/cc100-runtime/integration/jest.config.cjs', '--runInBand'],
    {
      ...process.env,
      WAGO_INTEGRATION_TEMP: temporary,
      WAGO_INTEGRATION_FLOW_SOURCE: join(flowRoot, backend, 'wago-flow.service.ts'),
      WAGO_INTEGRATION_MAIN_SOURCE: join(mainRoot, backend, 'wago.service.ts'),
      WAGO_INTEGRATION_LIFECYCLE_ONLY: process.argv.includes('--lifecycle-only') ? '1' : '0',
    },
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
