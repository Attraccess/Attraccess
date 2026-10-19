import { sourceFingerprint } from './assurance-fingerprint.mjs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { cpus, freemem, totalmem, platform, release } from 'node:os';
import { join, resolve } from 'node:path';
import { runBrokerFixture, validateFixtureEnvironment } from './broker-fixture.mjs';

export function assuranceOptions(env) {
  const integer = (key, fallback, minimum, maximum) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
      throw new Error(`${key} must be an integer between ${minimum} and ${maximum}`);
    return value;
  };
  const profile = env.WAGO_ASSURANCE_PROFILE ?? 'ci';
  if (!['ci', 'sustained'].includes(profile)) throw new Error('WAGO_ASSURANCE_PROFILE must be ci or sustained');
  return {
    profile,
    controllers: integer('WAGO_ASSURANCE_CONTROLLERS', 2, 2, 32),
    rate: integer('WAGO_ASSURANCE_RATE', 4, 1, 100),
    durationSeconds: integer(
      'WAGO_ASSURANCE_SECONDS',
      profile === 'ci' ? 16 : 3600,
      profile === 'ci' ? 12 : 3600,
      86400,
    ),
    seed: integer('WAGO_ASSURANCE_SEED', 988, 1, 2147483647),
    brokerMemoryMiB: integer('WAGO_ASSURANCE_BROKER_MEMORY_MIB', 1024, 256, 4096),
    brokerCpus: integer('WAGO_ASSURANCE_BROKER_CPUS', 2, 1, 8),
    memoryMiB: integer('WAGO_ASSURANCE_MEMORY_MIB', 1024, 64, 4096),
    maxPending: integer('WAGO_ASSURANCE_MAX_PENDING', 64, 1, 256),
    faults: (env.WAGO_ASSURANCE_FAULTS ?? 'runtime,plugin,broker').split(','),
  };
}

export async function main(env = process.env, fixture = runBrokerFixture, fingerprint = sourceFingerprint) {
  validateFixtureEnvironment(env);
  const options = assuranceOptions(env);
  if (options.faults.length > 16) throw new Error('At most 16 scheduled recovery exercises are supported');
  if (options.faults.some((fault) => !['runtime', 'plugin', 'broker'].includes(fault)))
    throw new Error('Unknown fault');
  const output = resolve(env.WAGO_ASSURANCE_OUTPUT ?? `/tmp/wago-assurance-${Date.now()}`);
  const root = resolve(import.meta.dirname, '../../../..');
  if (output === root || output.startsWith(`${root}/`)) throw new Error('Write evidence outside tracked source');
  await mkdir(output, { recursive: false });
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const diff = git('diff', 'HEAD');
  const metadata = {
    contract: 'wago-software-assurance-v1',
    evidenceClass: 'software-fixtures-only',
    revision: git('rev-parse', 'HEAD').trim(),
    dirty: Boolean(git('status', '--porcelain').trim()),
    sourceSha256: fingerprint(root),
    diffSha256: createHash('sha256').update(diff).digest('hex'),
    node: process.version,
    plugin: JSON.parse(await readFile(join(root, 'apps/plugins/wago/package.json'), 'utf8')).version,
    runtime: JSON.parse(await readFile(join(root, 'apps/plugins/wago/cc100-runtime/manifest.json'), 'utf8')),
    protocolMajor: 1,
    host: {
      platform: platform(),
      release: release(),
      cpus: cpus().length,
      totalMemory: totalmem(),
      freeMemory: freemem(),
    },
    options,
    startedAt: new Date().toISOString(),
  };
  await writeFile(join(output, 'environment.json'), JSON.stringify(metadata, null, 2));
  process.stdout.write(`Software assurance evidence: ${output}\n`);
  try {
    await fixture({
      tls: true,
      resources: { memoryMiB: options.brokerMemoryMiB, cpus: options.brokerCpus },
      config: 'apps/plugins/wago/scripts/jest.production-assurance.config.cjs',
      environment: { WAGO_ASSURANCE_OPTIONS: JSON.stringify(options), WAGO_ASSURANCE_OUTPUT: output },
      output: join(output, 'lifecycle.json'),
    });
  } finally {
    if (fingerprint(root) !== metadata.sourceSha256) {
      await writeFile(
        join(output, 'source-drift.json'),
        JSON.stringify({ outcome: 'invalid', reason: 'Implementation changed during the run' }),
      );
      process.exitCode = 1;
    }
  }
}
if (process.argv[1] === import.meta.filename) await main();
