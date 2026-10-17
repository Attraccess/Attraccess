import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

function checkHost(functionName, functions) {
  const result = spawnSync(
    'bash',
    [
      '-c',
      '. scripts/setup-host-dependencies.sh; NODE_VERSION=24.19.0; PNPM_VERSION=10.34.6; ' +
        functions +
        '; ' +
        functionName,
    ],
    { encoding: 'utf8' },
  );
  assert.ifError(result.error);
  return result;
}

test('host checks require the pinned Node and pnpm versions', () => {
  for (const version of ['v20.0.0', 'v24.0.0', 'v25.0.0']) {
    assert.equal(checkHost('check_node', `node() { echo ${version}; }`).status, 1);
  }
  assert.equal(checkHost('check_node', 'node() { echo v24.19.0; }').status, 0);
  assert.equal(checkHost('check_pnpm', 'pnpm() { echo 9.0.0; }').status, 1);
  assert.equal(checkHost('check_pnpm', 'pnpm() { echo 10.34.6; }').status, 0);
});

test('standalone docker-compose does not satisfy the services command requirement', () => {
  const result = checkHost('check_docker_compose', 'docker() { return 1; }; docker-compose() { return 0; }');
  assert.equal(result.status, 1);
  assert.equal(checkHost('check_docker_compose', 'docker() { return 0; }').status, 0);
});

test('workspace-only bootstrap skips host installation and keeps firmware opt-in', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'bootstrap-entry-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'scripts'));
  mkdirSync(path.join(root, 'apps/attractap/firmware/tools'), { recursive: true });
  copyFileSync('scripts/setup-dev-dependencies.sh', path.join(root, 'scripts/setup-dev-dependencies.sh'));
  const log = path.join(root, 'calls');
  for (const [file, label] of [
    ['scripts/setup-host-dependencies.sh', 'host'],
    ['scripts/setup-workspace.sh', 'workspace'],
    ['apps/attractap/firmware/tools/setup-esp-idf.sh', 'firmware'],
  ]) {
    writeFileSync(path.join(root, file), `#!/bin/sh\necho ${label} >> "$BOOTSTRAP_TEST_LOG"\n`, { mode: 0o755 });
  }
  writeFileSync(
    path.join(root, 'scripts/setup-host-dependencies.sh'),
    '#!/bin/sh\nsetup_host_dependencies() { export HOST_SETUP_TEST_READY=1; echo host >> "$BOOTSTRAP_TEST_LOG"; }\n',
  );
  writeFileSync(
    path.join(root, 'scripts/setup-workspace.sh'),
    '#!/bin/sh\necho workspace >> "$BOOTSTRAP_TEST_LOG"\nif [ "${HOST_SETUP_TEST_READY:-}" = 1 ]; then echo host-env >> "$BOOTSTRAP_TEST_LOG"; fi\n',
    { mode: 0o755 },
  );
  const run = (args, firmware = 'false') => {
    writeFileSync(log, '');
    const result = spawnSync('bash', [path.join(root, 'scripts/setup-dev-dependencies.sh'), ...args], {
      encoding: 'utf8',
      env: { ...process.env, INSTALL_ESP_IDF: firmware, BOOTSTRAP_TEST_LOG: log },
    });
    return { ...result, calls: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) };
  };
  assert.deepEqual(run([]).calls, ['host', 'workspace', 'host-env']);
  assert.deepEqual(run(['--workspace-only']).calls, ['workspace']);
  assert.deepEqual(run(['--workspace-only'], 'true').calls, ['workspace', 'firmware']);
  for (const args of [['--bogus'], ['--workspace-only', 'extra']]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.deepEqual(result.calls, []);
  }
});

test('ESP-IDF repairs tagged partial installations and verifies readiness', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'esp-idf-setup-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const checkout = path.join(root, 'esp-idf');
  const bin = path.join(root, 'bin');
  const tools = path.join(root, 'tools');
  const stale = path.join(tools, 'python_env/idf6.0_py3.13_env');
  mkdirSync(path.join(checkout, '.git'), { recursive: true });
  mkdirSync(bin);
  mkdirSync(stale, { recursive: true });
  const log = path.join(root, 'calls');
  const executable = (file, body) => writeFileSync(file, '#!/bin/sh\n' + body, { mode: 0o755 });
  executable(
    path.join(bin, 'git'),
    'echo "git $*" >> "$IDF_TEST_LOG"\ncase "$*" in *describe*) echo "${IDF_TEST_TAG:-v6.0.2}";; esac\n',
  );
  executable(
    path.join(checkout, 'install.sh'),
    'echo "install $*" >> "$IDF_TEST_LOG"\n[ "${IDF_TEST_FAIL_INSTALL:-0}" = 0 ] || exit 5\ntouch "$IDF_TEST_READY"\n',
  );
  writeFileSync(
    path.join(checkout, 'export.sh'),
    '[ "${IDF_TEST_FAIL_EXPORT:-0}" = 0 ] || return 7\n[ -f "$IDF_TEST_READY" ]\n',
  );
  executable(path.join(bin, 'idf.py'), 'echo "ready" >> "$IDF_TEST_LOG"\n');
  for (const command of ['cmake', 'ninja']) executable(path.join(bin, command), 'exit 0\n');
  const run = (extra = {}) => {
    writeFileSync(log, '');
    return spawnSync('bash', ['apps/attractap/firmware/tools/setup-esp-idf.sh', checkout], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: bin + path.delimiter + process.env.PATH,
        IDF_TOOLS_PATH: tools,
        IDF_TEST_LOG: log,
        IDF_TEST_READY: path.join(root, 'ready'),
        ...extra,
      },
    });
  };
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(stale), false);
  assert.match(readFileSync(log, 'utf8'), /install esp32s3\nready/);
  assert.equal(run().status, 0);
  assert.match(readFileSync(log, 'utf8'), /install esp32s3/);
  assert.equal(run({ IDF_TEST_TAG: 'v5.0.0' }).status, 0);
  assert.match(readFileSync(log, 'utf8'), /checkout --detach v6\.0\.2/);
  assert.equal(run({ IDF_TEST_FAIL_INSTALL: '1' }).status, 5);
  assert.doesNotMatch(readFileSync(log, 'utf8'), /\nready/);
  assert.equal(run({ IDF_TEST_FAIL_EXPORT: '1' }).status, 7);
});
