import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = path.join(root, 'scripts/services-compose.mts');

test('the stripped TypeScript CLI loads and preserves service command contracts', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'attraccess-services-'));
  const log = path.join(fixture, 'calls.jsonl');
  writeFileSync(
    path.join(fixture, 'docker'),
    `#!/usr/bin/env node
const fs = require('node:fs');
fs.appendFileSync(process.env.SERVICES_TEST_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
if (process.env.SERVICES_TEST_FAIL) { console.error('fixture Docker failure'); process.exit(7); }
if (process.argv.includes('--services')) console.log('mailpit\\nvalkey\\nkeycloak');
else if (process.argv.includes('ps')) console.log('fixture status');
`,
    { mode: 0o755 },
  );
  const run = (args, extra = {}) => {
    writeFileSync(log, '');
    const result = spawnSync(process.execPath, ['--experimental-strip-types', entry, ...args], {
      // Resolving the compose file must not depend on the caller's cwd.
      cwd: fixture,
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, PATH: fixture + path.delimiter + process.env.PATH, SERVICES_TEST_LOG: log, ...extra },
    });
    assert.ifError(result.error);
    const calls = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    for (const call of calls)
      assert.deepEqual(call.slice(0, 3), ['compose', '-f', path.join(root, 'services.docker-compose.yml')]);
    return { ...result, calls: calls.map((call) => call.slice(3)) };
  };
  try {
    const list = run(['list']);
    assert.equal(list.status, 0, list.stderr);
    assert.match(list.stdout, /Sets:[\s\S]*Services:[\s\S]*valkey/);
    assert.deepEqual(list.calls, [['config', '--services']]);
    const status = run(['status']);
    assert.equal(status.status, 0, status.stderr);
    assert.match(status.stdout, /fixture status/);
    assert.deepEqual(status.calls, [['config', '--services'], ['ps']]);
    for (const args of [[], ['up']]) {
      const result = run(args);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(result.calls, [
        ['config', '--services'],
        ['stop', 'valkey', 'keycloak'],
        ['up', '-d', 'mailpit'],
      ]);
    }
    const named = run(['up', 'valkey']);
    assert.equal(named.status, 0, named.stderr);
    assert.deepEqual(named.calls, [
      ['config', '--services'],
      ['stop', 'mailpit', 'keycloak'],
      ['up', '-d', 'valkey'],
    ]);
    const all = run(['up', 'all']);
    assert.equal(all.status, 0, all.stderr);
    assert.deepEqual(all.calls, [
      ['config', '--services'],
      ['up', '-d', 'mailpit', 'valkey', 'keycloak'],
    ]);
    const stop = run(['stop', 'valkey']);
    assert.equal(stop.status, 0, stop.stderr);
    assert.deepEqual(stop.calls, [
      ['config', '--services'],
      ['stop', 'valkey'],
    ]);
    const down = run(['down']);
    assert.equal(down.status, 0, down.stderr);
    assert.deepEqual(down.calls, [['config', '--services'], ['down']]);
    for (const [args, message] of [
      [['up', 'missing'], /Unknown set or service/],
      [['bogus'], /Unknown action/],
    ]) {
      const result = run(args);
      assert.equal(result.status, 1);
      assert.match(result.stderr, message);
      assert.deepEqual(result.calls, [['config', '--services']]);
    }
    const failure = run(['status'], { SERVICES_TEST_FAIL: '1' });
    assert.equal(failure.status, 1);
    assert.match(failure.stderr, /fixture Docker failure/);
    const help = run(['--help']);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Usage:/);
    assert.deepEqual(help.calls, []);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
