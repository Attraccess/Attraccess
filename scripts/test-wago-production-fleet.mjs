import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

// Fixture evidence only: real RabbitMQ and production code, no qualified hardware.
// Every run owns one container, ephemeral loopback port, and temporary directory.
const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(join(tmpdir(), 'wago-production-fleet-'));
const name = `wago-production-fleet-${randomUUID()}`;
const owner = randomUUID();
const password = randomUUID();
const context = process.env.WAGO_FLEET_DOCKER_CONTEXT ?? 'orbstack';
let container;
let child;
let interrupted = false;
const docker = (...args) => exec('docker', ['--context', context, ...args], { timeout: 60_000 });
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
    recovered.labels?.['attraccess.fixture'] !== 'production-fleet' ||
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
  const result = await docker(
    'run',
    '-d',
    '--name',
    name,
    '--label',
    'attraccess.fixture=production-fleet',
    '--label',
    `attraccess.fixture.owner=${owner}`,
    '-p',
    '127.0.0.1::1883',
    '-e',
    'RABBITMQ_DEFAULT_USER=fixture',
    '-e',
    `RABBITMQ_DEFAULT_PASS=${password}`,
    'rabbitmq:4-management',
    'sh',
    '-c',
    'rabbitmq-plugins enable --offline rabbitmq_mqtt >/dev/null && exec rabbitmq-server',
  );
  container = result.stdout.trim();
  const port = (await docker('port', container, '1883/tcp')).stdout.trim();
  if (!/^127\.0\.0\.1:\d+$/.test(port)) throw new Error(`Expected exclusive loopback binding, got ${port}`);
  process.stdout.write(`Fixture only: ${name}, MQTT ${port}, Docker context ${context}\n`);
  const deadline = Date.now() + 90_000;
  for (;;) {
    if (interrupted) throw new Error('Interrupted');
    try {
      await docker('exec', container, 'rabbitmq-diagnostics', '-q', 'check_running');
      break;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const status = await new Promise((resolve, reject) => {
    child = spawn(
      process.execPath,
      [
        join(root, 'node_modules/jest/bin/jest.js'),
        '--config',
        'scripts/test-wago-production-fleet.config.cjs',
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
          WAGO_FLEET_TEMP: temporary,
          WAGO_FLEET_MQTT_URL: `mqtt://${port}`,
          WAGO_FLEET_MQTT_PASSWORD: password,
        },
      },
    );
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  if (status !== 0 || interrupted) process.exitCode = 1;
} finally {
  try {
    // Also recover after a timed-out startup; only remove the exact owned container.
    const recovered = await recoverOwnedContainer();
    if (container && recovered && container !== recovered)
      throw new Error(`Cannot verify ownership of RabbitMQ container ${name}`);
    if (recovered) {
      await docker('rm', '-f', '-v', recovered);
      process.stdout.write(`Removed owned RabbitMQ container ${name}\n`);
    }
  } finally {
    try {
      await rm(temporary, { recursive: true, force: true });
      process.stdout.write(`Removed fixture directory ${temporary}\n`);
    } finally {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', interrupt);
    }
  }
}
