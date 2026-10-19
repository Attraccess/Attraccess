import { sourceFingerprint } from './assurance-fingerprint.mjs';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { assuranceOptions, main } from './test-production-assurance.mjs';

const exec = promisify(execFile);
test('assurance workload bounds include an actual one-hour sustained minimum', () => {
  assert.equal(assuranceOptions({}).durationSeconds, 16);
  assert.equal(assuranceOptions({ WAGO_ASSURANCE_PROFILE: 'sustained' }).durationSeconds, 3600);
  for (const env of [
    { WAGO_ASSURANCE_PROFILE: 'sustained', WAGO_ASSURANCE_SECONDS: '3599' },
    { WAGO_ASSURANCE_CONTROLLERS: '33' },
    { WAGO_ASSURANCE_RATE: '101' },
    { WAGO_ASSURANCE_SECONDS: '86401' },
    { WAGO_ASSURANCE_MEMORY_MIB: '0' },
    { WAGO_ASSURANCE_MAX_PENDING: '257' },
    { WAGO_ASSURANCE_SEED: 'NaN' },
  ])
    assert.throws(() => assuranceOptions(env));
});

test('broker runner rejects unspecified Docker context and inherited application configuration before startup', async () => {
  for (const env of [
    {},
    { WAGO_FLEET_DOCKER_CONTEXT: 'fixture', STORAGE_ROOT: '/application' },
    { WAGO_FLEET_DOCKER_CONTEXT: 'fixture', WAGO_FLEET_MQTT_URL: 'mqtt://application' },
  ]) {
    await assert.rejects(
      exec(process.execPath, ['apps/plugins/wago/scripts/test-production-fleet.mjs'], {
        env: { PATH: '/nonexistent', ...env },
      }),
      /explicit|inherited/,
    );
  }
});

test('source evidence binds untracked implementation changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wago-fingerprint-'));
  try {
    await exec('git', ['init', '-q', root]);
    await mkdir(join(root, 'apps/plugins/wago'), { recursive: true });
    const code = join(root, 'apps/plugins/wago/input.ts');
    await writeFile(code, 'original');
    const original = sourceFingerprint(root);
    await writeFile(code, 'changed');
    assert.notEqual(sourceFingerprint(root), original);
    await exec('git', ['-C', root, 'add', '.']);
    assert.notEqual(sourceFingerprint(root), original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('both runner entry points reject all inherited endpoints before allocating broker resources', async () => {
  for (const runner of ['test-production-fleet.mjs', 'test-production-assurance.mjs']) {
    for (const key of [
      'WAGO_FLEET_MQTT_URL',
      'WAGO_FLEET_MANAGEMENT_URL',
      'WAGO_FLEET_MQTTS_URL',
      'WAGO_FLEET_HTTPS_URL',
    ]) {
      await assert.rejects(
        exec(process.execPath, [`apps/plugins/wago/scripts/${runner}`], {
          env: { PATH: '/nonexistent', WAGO_FLEET_DOCKER_CONTEXT: 'fixture', [key]: 'https://application' },
        }),
        new RegExp(`inherited.*${key}`),
      );
    }
    await assert.rejects(
      exec(process.execPath, [`apps/plugins/wago/scripts/${runner}`], {
        env: { PATH: '/nonexistent', WAGO_FLEET_DOCKER_CONTEXT: 'bad context' },
      }),
      /explicit/,
    );
  }
});

test('exceptional fixture cleanup still invalidates source drift and preserves the original failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wago-drift-test-'));
  const previousExitCode = process.exitCode;
  try {
    let fingerprint = 'before';
    const failure = new Error('fixture cleanup failed');
    await assert.rejects(
      main(
        { WAGO_ASSURANCE_OUTPUT: join(directory, 'evidence'), WAGO_FLEET_DOCKER_CONTEXT: 'fixture' },
        async () => {
          fingerprint = 'after';
          throw failure;
        },
        () => fingerprint,
      ),
      (error) => error === failure,
    );
    assert.equal(JSON.parse(await readFile(join(directory, 'evidence/source-drift.json'), 'utf8')).outcome, 'invalid');
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previousExitCode;
    await rm(directory, { recursive: true, force: true });
  }
});
