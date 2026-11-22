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

test('host setup continues when nvm has no installed default version', (t) => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'bootstrap-nvm-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  mkdirSync(path.join(home, '.nvm'));
  // A fresh nvm install returns non-zero from nvm.sh until a Node version is installed.
  writeFileSync(path.join(home, '.nvm/nvm.sh'), 'return 3\n');
  const stubs = [
    'check_docker',
    'check_docker_compose',
    'check_node',
    'resolve_pnpm_version',
    'check_pnpm',
    'check_python',
  ];
  const result = spawnSync(
    'bash',
    [
      '-c',
      `. scripts/setup-host-dependencies.sh; ${stubs.map((name) => `${name}() { :; }`).join('; ')}; setup_host_dependencies; echo done`,
    ],
    { encoding: 'utf8', env: { ...process.env, HOME: home } },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'done');
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
  mkdirSync(path.join(root, 'apps/api/scripts/lib'), { recursive: true });
  copyFileSync('scripts/check-database-type.sh', path.join(root, 'scripts/check-database-type.sh'));
  copyFileSync(
    'apps/api/scripts/lib/database-provider.mjs',
    path.join(root, 'apps/api/scripts/lib/database-provider.mjs'),
  );
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
  const run = (args, firmware = 'false', extraEnv = {}) => {
    writeFileSync(log, '');
    const result = spawnSync('bash', [path.join(root, 'scripts/setup-dev-dependencies.sh'), ...args], {
      encoding: 'utf8',
      env: { ...process.env, INSTALL_ESP_IDF: firmware, BOOTSTRAP_TEST_LOG: log, ...extraEnv },
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
  // An unsupported database stops the bootstrap before host, workspace or firmware setup changes anything.
  const unsupported = run([], 'true', { DATABASE_TYPE: 'oracle' });
  assert.equal(unsupported.status, 1);
  assert.match(unsupported.stderr, /Unsupported DATABASE_TYPE "oracle"/);
  assert.deepEqual(unsupported.calls, []);
  assert.deepEqual(run(['--workspace-only'], 'false', { DATABASE_TYPE: 'postgres' }).calls, ['workspace']);
  // The repository .env selects the backend too, and the environment wins over it.
  writeFileSync(path.join(root, '.env'), 'DATABASE_TYPE=oracle\n');
  assert.equal(run(['--workspace-only'], 'false', { DATABASE_TYPE: undefined }).status, 1);
  assert.deepEqual(run(['--workspace-only'], 'false', { DATABASE_TYPE: 'postgres' }).calls, ['workspace']);
});

test('worktree creation refuses an unsupported DATABASE_TYPE before creating the worktree', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'worktree-database-type-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  mkdirSync(path.join(repo, 'apps/api/scripts/lib'), { recursive: true });
  for (const file of [
    'scripts/create-worktree.sh',
    'scripts/check-database-type.sh',
    'apps/api/scripts/lib/database-provider.mjs',
  ]) {
    copyFileSync(file, path.join(repo, file));
  }
  const git = (...args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  writeFileSync(path.join(repo, 'scripts/setup-dev-dependencies.sh'), '#!/bin/sh\ntouch "$PWD/bootstrapped"\n', {
    mode: 0o755,
  });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'init');
  const create = (name, databaseType) =>
    spawnSync('sh', [path.join(repo, 'scripts/create-worktree.sh'), path.join(root, name), name, 'main'], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_TYPE: databaseType },
    });

  const refused = create('wt-bad', 'oracle');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /Unsupported DATABASE_TYPE "oracle"/);
  assert.equal(existsSync(path.join(root, 'wt-bad')), false);
  assert.doesNotMatch(git('branch', '--list', 'wt-bad').stdout, /wt-bad/);

  const created = create('wt-ok', 'postgres');
  assert.equal(created.status, 0, created.stderr);
  assert.equal(existsSync(path.join(root, 'wt-ok/.worktree-bootstrap-complete')), true);
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
  assert.match(readFileSync(log, 'utf8'), /install esp32s3,esp32\nready/);
  assert.equal(run().status, 0);
  assert.match(readFileSync(log, 'utf8'), /install esp32s3,esp32/);
  assert.equal(run({ IDF_TEST_TAG: 'v5.0.0' }).status, 0);
  assert.match(readFileSync(log, 'utf8'), /checkout --detach v6\.0\.2/);
  assert.equal(run({ IDF_TEST_FAIL_INSTALL: '1' }).status, 5);
  assert.doesNotMatch(readFileSync(log, 'utf8'), /\nready/);
  assert.equal(run({ IDF_TEST_FAIL_EXPORT: '1' }).status, 7);
});
