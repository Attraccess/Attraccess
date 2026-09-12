import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const runner = resolve(import.meta.dirname, 'test-wago-production-fleet.mjs');

// Run the actual CLI with a fake Docker executable. No daemon or broker is used.
const fakeDocker = `#!${process.execPath}
import { readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(4);
const file = process.env.FIXTURE_STATE;
const state = JSON.parse(readFileSync(file, 'utf8'));
state.calls.push(args);
const fail = (message) => { console.error(message); process.exitCode = 1; };
if (args[0] === 'run') {
  state.name = args[args.indexOf('--name') + 1];
  state.labels = Object.fromEntries(args.flatMap((arg, index) =>
    arg === '--label' ? [args[index + 1].split('=')] : []));
  if (state.scenario === 'known-container-removal-fails') console.log('owned-container-id');
  else fail('Fixture startup failed after container creation');
} else if (args[0] === 'inspect') {
  if (state.scenario === 'absent-container') fail('Error: No such object: ' + state.name);
  else {
    const labels = { ...state.labels };
    if (state.scenario === 'foreign-owner') labels['attraccess.fixture.owner'] = 'someone-else';
    console.log(JSON.stringify({
      id: 'owned-container-id',
      name: state.scenario === 'foreign-name' ? '/someone-else' : '/' + state.name,
      labels,
    }));
  }
} else if (args[0] === 'port') {
  fail('Fixture port lookup failed');
} else if (args[0] === 'rm') {
  if (state.scenario.endsWith('removal-fails')) fail('Fixture removal failed');
  else state.removed = args.at(-1);
} else fail('Unexpected Docker operation');
writeFileSync(file, JSON.stringify(state));
`;

for (const scenario of [
  'startup-fails',
  'foreign-owner',
  'foreign-name',
  'absent-container',
  'recovered-container-removal-fails',
  'known-container-removal-fails',
]) {
  test(`production fleet cleanup: ${scenario}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wago-fleet-cleanup-test-'));
    const temporary = join(directory, 'temporary');
    const stateFile = join(directory, 'state.json');
    try {
      await mkdir(temporary);
      await writeFile(join(directory, 'docker'), fakeDocker, { mode: 0o700 });
      await writeFile(stateFile, JSON.stringify({ scenario, calls: [] }));
      await assert.rejects(
        exec(process.execPath, [runner], {
          timeout: 10_000,
          env: {
            PATH: directory,
            TMPDIR: temporary,
            FIXTURE_STATE: stateFile,
            WAGO_FLEET_DOCKER_CONTEXT: 'fixture-only',
          },
        }),
        (error) => error.code === 1 && /Fixture|ownership|No such object/.test(error.stderr),
      );
      const state = JSON.parse(await readFile(stateFile, 'utf8'));
      const removals = state.calls.filter(([command]) => command === 'rm');
      const mayRemove = !['foreign-owner', 'foreign-name', 'absent-container'].includes(scenario);
      assert.deepEqual(removals, mayRemove ? [['rm', '-f', '-v', 'owned-container-id']] : []);
      if (scenario === 'startup-fails') assert.equal(state.removed, 'owned-container-id');
      assert.deepEqual(await readdir(temporary), [], 'Runner must remove its temp directory even if Docker fails');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
