import { createBrokerTls } from './broker-tls.mjs';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

// Fixture evidence only: real RabbitMQ and production code, no qualified hardware.
// Every run owns one container, ephemeral loopback port, and temporary directory.
const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../../..');
export function validateFixtureEnvironment(env) {
  const context = env.WAGO_FLEET_DOCKER_CONTEXT;
  if (!context || !/^[A-Za-z0-9_.-]+$/.test(context)) throw new Error('Select an explicit WAGO_FLEET_DOCKER_CONTEXT');
  for (const key of [
    'WAGO_FLEET_MQTT_URL',
    'WAGO_FLEET_MANAGEMENT_URL',
    'WAGO_FLEET_MQTTS_URL',
    'WAGO_FLEET_HTTPS_URL',
    'WAGO_FLEET_MQTT_PASSWORD',
    'WAGO_FLEET_TEMP',
    'DATABASE_URL',
    'STORAGE_ROOT',
  ])
    if (env[key]) throw new Error(`Refusing inherited application or fixture setting: ${key}`);
  return context;
}
export async function runBrokerFixture({
  config = 'apps/plugins/wago/scripts/jest.production-fleet.config.cjs',
  environment = {},
  output,
  tls = false,
  resources = { memoryMiB: 1024, cpus: 2 },
} = {}) {
  const context = validateFixtureEnvironment(process.env);
  const temporary = await mkdtemp(join(tmpdir(), 'wago-production-fleet-'));
  const name = `wago-production-fleet-${randomUUID()}`;
  const owner = randomUUID();
  const password = randomUUID();

  let container;
  let child;
  let forceStop;
  let interrupted = false;
  let outcome = 'failed';
  let cleanup = 'pending';
  const startedAt = new Date().toISOString();
  const docker = async (...args) => {
    try {
      return await exec('docker', ['--context', context, ...args], { timeout: 60_000 });
    } catch (error) {
      const stderr = String(error.stderr ?? '')
        .replaceAll(password, '[redacted]')
        .slice(0, 2000);
      const sanitized = new Error(`Fixture Docker ${args[0]} failed: ${stderr}`);
      sanitized.stderr = stderr;
      throw sanitized;
    }
  };
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
    if (child && !forceStop) {
      forceStop = setTimeout(() => child?.kill('SIGKILL'), 5000);
      forceStop.unref();
    }
  };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    const tlsDirectory = tls ? await createBrokerTls(temporary) : undefined;
    if (interrupted) throw new Error('Interrupted before broker startup');
    const result = await docker(
      'run',
      '-d',
      '--memory',
      `${resources.memoryMiB}m`,
      '--cpus',
      String(resources.cpus),
      '--pids-limit',
      '512',
      '--name',
      name,
      '--label',
      'attraccess.fixture=production-fleet',
      '--label',
      `attraccess.fixture.owner=${owner}`,
      '-p',
      '127.0.0.1::1883',
      '-p',
      '127.0.0.1::15672',
      '-e',
      'RABBITMQ_DEFAULT_USER=fixture',
      '-e',
      `RABBITMQ_DEFAULT_PASS=${password}`,
      ...(tlsDirectory
        ? [
            '-p',
            '127.0.0.1::8883',
            '-p',
            '127.0.0.1::15671',
            '-v',
            `${tlsDirectory}:/fixture-tls:ro`,
            '-v',
            `${tlsDirectory}/rabbitmq.conf:/etc/rabbitmq/rabbitmq.conf:ro`,
          ]
        : []),
      'rabbitmq:4.3.4-management',
      'sh',
      '-c',
      'rabbitmq-plugins enable --offline rabbitmq_mqtt >/dev/null && exec rabbitmq-server',
    );
    container = result.stdout.trim();
    if (interrupted) throw new Error('Interrupted during broker startup');
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
    const managementPort = (await docker('port', container, '15672/tcp')).stdout.trim();
    if (!/^127\.0\.0\.1:\d+$/.test(managementPort)) throw new Error('Expected exclusive loopback management binding');
    const tlsEnvironment = {};
    if (tlsDirectory) {
      for (const [key, portName, scheme] of [
        ['WAGO_FLEET_MQTTS_URL', '8883/tcp', 'mqtts'],
        ['WAGO_FLEET_HTTPS_URL', '15671/tcp', 'https'],
      ]) {
        const binding = (await docker('port', container, portName)).stdout.trim();
        if (!/^127\.0\.0\.1:\d+$/.test(binding)) throw new Error('Expected exclusive loopback TLS binding');
        tlsEnvironment[key] = `${scheme}://${binding}`;
      }
      tlsEnvironment.WAGO_FLEET_CA = join(tlsDirectory, 'ca.pem');
    }
    if (output) {
      const identity = JSON.parse((await docker('inspect', '--format', '{{json .}}', container)).stdout);
      await writeFile(
        output.replace(/lifecycle[.]json$/, 'broker.json'),
        JSON.stringify(
          {
            image: identity.Config.Image,
            imageId: identity.Image,
            rabbitmq: (await docker('exec', container, 'rabbitmqctl', 'version')).stdout.trim(),
          },
          null,
          2,
        ),
      );
    }
    const status = await new Promise((resolve, reject) => {
      child = spawn(
        process.execPath,
        [join(root, 'node_modules/jest/bin/jest.js'), '--config', config, '--runInBand'],
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
            WAGO_FLEET_MANAGEMENT_URL: `http://${managementPort}`,
            WAGO_FLEET_DOCKER_CONTEXT: context,
            WAGO_FLEET_CONTAINER: container,
            ...tlsEnvironment,
            ...environment,
          },
        },
      );
      child.once('error', reject);
      child.once('exit', (code) => resolve(code ?? 1));
    });
    outcome = interrupted ? 'interrupted' : status === 0 ? 'passed' : 'failed';
    if (status !== 0 || interrupted) process.exitCode = 1;
  } finally {
    try {
      cleanup = 'failed';
      // docker run can create the container before failing or timing out, without
      // returning its ID. Recover by name only after verifying this run's label.
      if (!container) container = await recoverOwnedContainer();
      if (container) {
        const verified = await recoverOwnedContainer();
        if (verified !== container) throw new Error('Container ownership changed before cleanup');
        await docker('rm', '-f', '-v', container);
        cleanup = 'removed';
        process.stdout.write(`Removed owned RabbitMQ container ${name}\n`);
      } else cleanup = 'no-container';
    } finally {
      try {
        await rm(temporary, { recursive: true, force: true });
        process.stdout.write(`Removed fixture directory ${temporary}\n`);
      } finally {
        if (output)
          await writeFile(
            output,
            JSON.stringify(
              {
                startedAt,
                finishedAt: new Date().toISOString(),
                outcome: interrupted ? 'interrupted' : outcome,
                cleanup,
              },
              null,
              2,
            ),
          );
        if (forceStop) clearTimeout(forceStop);
        process.off('SIGINT', interrupt);
        process.off('SIGTERM', interrupt);
      }
    }
  }
}
