import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

// Simulator measurement only: a runner-owned RabbitMQ 4 broker, the real server plugin on the host's real
// MQTT services, and simulated controllers in a second process. Never evidence about physical hardware.
//
//   node apps/plugins/wago/scripts/test-reliability.mjs [--mode=short|sweep] [--output=summary.json]
//
// The summary is JSON on stdout and, with --output, in that file. It is never committed.
const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../../..');
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const mode = arg('mode') ?? 'short';
if (!['short', 'sweep'].includes(mode)) throw new Error(`Unknown mode "${mode}"; use short or sweep`);
const output = arg('output');
const temporary = await mkdtemp(join(tmpdir(), 'wago-reliability-'));
const name = `wago-reliability-${randomUUID()}`;
const owner = randomUUID();
const password = randomUUID();
let container;
let child;
let interrupted = false;
const context =
  process.env.WAGO_RELIABILITY_DOCKER_CONTEXT ??
  (await exec('docker', ['context', 'show']).then(
    ({ stdout }) => stdout.trim(),
    () => 'default',
  ));
// The broker password reaches `docker run -e RABBITMQ_DEFAULT_PASS` through the environment, never the argument
// list: execFile errors quote the full command line into CI logs.
const docker = (...args) =>
  exec('docker', ['--context', context, ...args], {
    timeout: 120_000,
    env: { ...process.env, RABBITMQ_DEFAULT_PASS: password },
  });

async function freePort() {
  const server = createServer();
  await new Promise((resolveListening) => server.listen(0, '127.0.0.1', resolveListening));
  const { port } = server.address();
  await new Promise((resolveClosed) => server.close(resolveClosed));
  return port;
}

async function recoverOwnedContainer() {
  let result;
  try {
    result = await docker(
      'inspect',
      '--type',
      'container',
      '--format',
      '{"id":{{json .Id}},"name":{{json .Name}},"labels":{{json .Config.Labels}}}',
      name,
    );
  } catch (error) {
    if (!/No such (object|container):/.test(error.stderr ?? '')) throw error;
    return undefined;
  }
  const recovered = JSON.parse(result.stdout);
  if (
    recovered.name !== `/${name}` ||
    recovered.labels?.['attraccess.fixture'] !== 'reliability' ||
    recovered.labels?.['attraccess.fixture.owner'] !== owner ||
    typeof recovered.id !== 'string' ||
    !recovered.id
  )
    throw new Error(`Cannot verify ownership of RabbitMQ container ${name}`);
  return recovered.id;
}

const interrupt = () => {
  interrupted = true;
  child?.kill('SIGTERM');
};
process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);

try {
  // The simulated controllers run as a bundled script so they are a separate OS process from the host side.
  const farm = join(temporary, 'controller-farm.cjs');
  await exec(
    join(root, 'node_modules/.bin/esbuild'),
    [
      join(root, 'apps/plugins/wago/acceptance/reliability/controller-farm.test-utils.ts'),
      '--bundle',
      '--platform=node',
      '--format=cjs',
      '--target=node24',
      `--outfile=${farm}`,
      '--log-level=warning',
    ],
    { cwd: root, timeout: 120_000 },
  );

  // A fixed host port survives the broker restart the outage failure performs.
  const port = await freePort();
  const result = await docker(
    'run',
    '-d',
    '--name',
    name,
    '--label',
    'attraccess.fixture=reliability',
    '--label',
    `attraccess.fixture.owner=${owner}`,
    '-p',
    `127.0.0.1:${port}:1883`,
    '-e',
    'RABBITMQ_DEFAULT_USER=fixture',
    '-e',
    'RABBITMQ_DEFAULT_PASS',
    'rabbitmq:4-management',
    'sh',
    '-c',
    'rabbitmq-plugins enable --offline rabbitmq_mqtt >/dev/null && exec rabbitmq-server',
  );
  container = result.stdout.trim();
  process.stdout.write(`Simulator measurement: ${name}, MQTT 127.0.0.1:${port}, Docker context ${context}\n`);
  const deadline = Date.now() + 300_000;
  for (;;) {
    if (interrupted) throw new Error('Interrupted');
    try {
      await docker('exec', container, 'rabbitmq-diagnostics', '-q', 'check_running');
      break;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  }
  const brokerImage = (await docker('inspect', '--format', '{{.Config.Image}} {{.Image}}', container)).stdout.trim();
  const commit = (await exec('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
  const summary = join(temporary, 'summary.json');
  const status = await new Promise((resolveStatus, reject) => {
    child = spawn(
      process.execPath,
      [
        join(root, 'node_modules/jest/bin/jest.js'),
        '--config',
        'apps/plugins/wago/scripts/jest.reliability.config.cjs',
        '--runInBand',
      ],
      {
        cwd: root,
        stdio: 'inherit',
        // Never inherit an application's broker, database, or credentials.
        env: {
          PATH: process.env.PATH,
          TMPDIR: tmpdir(),
          NODE_ENV: 'test',
          NX_DAEMON: 'false',
          STORAGE_ROOT: temporary,
          WAGO_RELIABILITY_MODE: mode,
          WAGO_RELIABILITY_MQTT_URL: `mqtt://127.0.0.1:${port}`,
          WAGO_RELIABILITY_MQTT_PASSWORD: password,
          WAGO_RELIABILITY_DIRECTORY: temporary,
          WAGO_RELIABILITY_FARM: farm,
          WAGO_RELIABILITY_CONTAINER: container,
          WAGO_RELIABILITY_DOCKER_CONTEXT: context,
          WAGO_RELIABILITY_SUMMARY: summary,
          WAGO_RELIABILITY_COMMIT: commit,
          WAGO_RELIABILITY_BROKER: brokerImage,
        },
      },
    );
    child.once('error', reject);
    child.once('exit', (code) => resolveStatus(code ?? 1));
  });
  if (output) {
    await copyFile(summary, resolve(output)).catch(() => undefined);
    process.stdout.write(`Summary written to ${resolve(output)} (do not commit it)\n`);
  }
  if (status !== 0 || interrupted) process.exitCode = 1;
} finally {
  try {
    // docker run can create the container before failing or timing out, without
    // returning its ID. Recover by name only after verifying this run's label.
    if (!container) container = await recoverOwnedContainer();
    if (container) {
      await docker('rm', '-f', '-v', container);
      process.stdout.write(`Removed owned RabbitMQ container ${name}\n`);
    }
  } finally {
    try {
      await rm(temporary, { recursive: true, force: true });
      process.stdout.write(`Removed reliability directory ${temporary}\n`);
    } finally {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', interrupt);
    }
  }
}
