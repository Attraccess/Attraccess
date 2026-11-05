import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { fixtureGitEnv } from './test-utils/git-env.mjs';
import { isRuntimeSource } from './check-wago-runtime-version.mjs';

const script = fileURLToPath(new URL('./check-wago-runtime-version.mjs', import.meta.url));
const manifest = 'apps/plugins/wago/cc100-runtime/manifest.json';
const source = 'apps/plugins/wago/cc100-runtime/src/runtime.ts';

test('covers shared contracts, runtime dependencies, image construction and activation, excluding tests/docs/simulators', () => {
  for (const path of [
    source,
    manifest,
    'apps/plugins/wago/modbus/model.ts',
    'apps/plugins/wago/shared/hardware-profile.ts',
    'apps/plugins/wago/project.json',
    'apps/plugins/wago/channel-behavior.ts',
    'apps/plugins/wago/measurement-contract.ts',
    'apps/plugins/wago/cc100-runtime/Dockerfile',
    'apps/plugins/wago/backend/protocol/index.ts',
    'apps/plugins/wago/backend/host/hardware-deployment.ts',
    'apps/plugins/wago/backend/host/host-io-guard.ts',
    'apps/plugins/wago/backend/runtime/supervisor.ts',
    'apps/plugins/wago/backend/runtime/install.ts',
    'apps/plugins/wago/backend/runtime/update/shell.ts',
    '.github/actions/build-cc100-runtime/action.yml',
  ])
    assert.equal(isRuntimeSource(path), true, path);
  for (const path of [
    'apps/plugins/wago/frontend/src/controllers/Table.tsx',
    'apps/plugins/wago/cc100-runtime/src/runtime.spec.ts',
    'apps/plugins/wago/cc100-runtime/HARDWARE.md',
    'apps/plugins/wago/cc100-runtime/integration/run.mjs',
    'apps/plugins/wago/cc100-runtime/src/simulator.ts',
    'apps/plugins/wago/cc100-runtime/src/simulator/device.ts',
    'apps/plugins/wago/cc100-runtime/Dockerfile.simulator',
    // Decided by content, see the fixture cases below.
    'pnpm-lock.yaml',
    'package.json',
  ])
    assert.equal(isRuntimeSource(path), false, path);
});

for (const [name, path, next, pass] of [
  ['requires a bump for runtime edits', source, '0.2.0', false],
  ['requires a bump for shared code', 'apps/plugins/wago/modbus/model.ts', '0.2.0', false],
  ['accepts a patch bump', source, '0.2.1', true],
  ['accepts a minor bump', source, '0.3.0', true],
  ['accepts a major bump', source, '1.0.0', true],
  ['compares numeric components', source, '0.10.0', true],
  ['rejects a downgrade', source, '0.1.9', false],
  ['rejects a malformed version', source, 'banana', false],
  ['rejects a prerelease version', source, '0.3.0-dev', false],
  ['rejects a manifest-only downgrade', manifest, '0.1.0', false],
  ['allows docs without a bump', 'apps/plugins/wago/cc100-runtime/README.md', '0.2.0', true],
  ['allows test edits without a bump', 'apps/plugins/wago/cc100-runtime/src/runtime.spec.ts', '0.2.0', true],
  ['allows unrelated edits without a bump', 'apps/frontend/README.md', '0.2.0', true],
]) {
  test(name, () => {
    const directory = mkdtempSync(join(tmpdir(), 'cc100-version-check-'));
    const env = fixtureGitEnv();
    const git = (...args) => execFileSync('git', args, { cwd: directory, env, encoding: 'utf8' }).trim();
    const file = (path, content) => {
      mkdirSync(join(directory, path, '..'), { recursive: true });
      writeFileSync(join(directory, path), content);
    };
    try {
      git('init', '--quiet');
      git('config', 'user.email', 'test@example.com');
      git('config', 'user.name', 'Test');
      git('config', 'commit.gpgsign', 'false');
      file(manifest, JSON.stringify({ runtimeVersion: '0.2.0' }));
      file(source, 'baseline');
      git('add', '.');
      git('commit', '--quiet', '-m', 'baseline');
      const base = git('rev-parse', 'HEAD');
      file(path, 'changed');
      file(manifest, JSON.stringify({ runtimeVersion: next }));
      git('add', '.');
      git('commit', '--quiet', '--allow-empty', '-m', 'change');
      if (pass)
        assert.match(
          execFileSync(process.execPath, [script, base], { cwd: directory, env, encoding: 'utf8' }),
          /increased|No WAGO/,
        );
      else assert.throws(() => execFileSync(process.execPath, [script, base], { cwd: directory, env, stdio: 'pipe' }));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

const runtimePackage = 'apps/plugins/wago/cc100-runtime/package.json';

const lockfile = ({
  mqtt = '5.16.0',
  packet = '9.0.2',
  other = '1.0.0',
  version = '9.0',
  filler = 0,
} = {}) => `lockfileVersion: '${version}'

settings:
  autoInstallPeers: true

importers:

  .:
    dependencies:
      mqtt:
        specifier: ^5.15.2
        version: ${mqtt}
      other:
        specifier: ^1.0.0
        version: ${other}
    devDependencies:
      '@scope/tool':
        specifier: ^2.0.0
        version: 2.0.0(other@${other})

packages:

  mqtt@5.16.0:
    resolution: {integrity: sha512-aaa}

snapshots:

  '@scope/tool@2.0.0(other@${other})':
    dependencies:
      other: ${other}

  mqtt-packet@${packet}:
    dependencies:
      debug: 4.4.3(supports-color@7.2.0)
    transitivePeerDependencies:
      - supports-color

  mqtt@${mqtt}:
    dependencies:
      mqtt-packet: ${packet}
    optionalDependencies:
      bufferutil: 4.0.0

  other@${other}: {}

  debug@4.4.3(supports-color@7.2.0): {}

  bufferutil@4.0.0: {}
${Array.from({ length: filler }, (_, index) => `\n  filler-package-${index}@1.0.0: {}\n`).join('')}`;

// Larger than the 1 MiB default of execFileSync, like the real root lockfile.
const bigLockfile = (options = {}) => lockfile({ filler: 40000, ...options });

const rootPackage = ({
  mqtt = '^5.15.2',
  other = '^1.0.0',
  overrides = {},
  scripts = 'a',
  manager = 'pnpm@10.0.0',
} = {}) =>
  JSON.stringify({
    scripts: { build: scripts },
    dependencies: { other },
    devDependencies: { mqtt },
    packageManager: manager,
    pnpm: { overrides },
  });

for (const [name, files, pass, message, baseline] of [
  ['allows an unrelated lockfile change', { 'pnpm-lock.yaml': lockfile({ other: '1.0.1' }) }, true],
  [
    'requires a bump for a changed mqtt version',
    { 'pnpm-lock.yaml': lockfile({ mqtt: '5.16.1' }) },
    false,
    /mqtt 5\.16\.0 → 5\.16\.1/,
  ],
  [
    'requires a bump for a changed transitive dependency of mqtt',
    { 'pnpm-lock.yaml': lockfile({ packet: '9.0.3' }) },
    false,
    /mqtt-packet 9\.0\.2 → 9\.0\.3/,
  ],
  [
    'allows an unrelated root package.json change',
    { 'package.json': rootPackage({ other: '^1.1.0', scripts: 'b' }) },
    true,
  ],
  [
    'requires a bump for a changed mqtt specifier',
    { 'package.json': rootPackage({ mqtt: '^5.16.0' }) },
    false,
    /devDependencies\.mqtt/,
  ],
  [
    'requires a bump for changed pnpm overrides',
    { 'package.json': rootPackage({ overrides: { debug: '4.4.4' } }) },
    false,
    /pnpm\.overrides/,
  ],
  [
    'requires a bump for a changed packageManager',
    { 'package.json': rootPackage({ manager: 'pnpm@10.1.0' }) },
    false,
    /packageManager/,
  ],
  [
    'treats an unparseable lockfile as runtime source',
    { 'pnpm-lock.yaml': 'not: [a lockfile' },
    false,
    /could not be analysed/,
  ],
  [
    'treats an unknown lockfile version as runtime source',
    { 'pnpm-lock.yaml': lockfile({ version: '10.0' }) },
    false,
    /lockfileVersion/,
  ],
  [
    'treats an unparseable package.json as runtime source',
    { 'package.json': '{ nope' },
    false,
    /could not be analysed/,
  ],
  [
    'follows the dependencies declared by the runtime package',
    {
      [runtimePackage]: JSON.stringify({ dependencies: { mqtt: '^5.15.2', other: '^1.0.0' } }),
      'pnpm-lock.yaml': lockfile({ other: '1.0.1' }),
    },
    false,
    /other 1\.0\.0 → 1\.0\.1/,
  ],
  [
    'allows an unrelated change to a lockfile larger than 1 MiB',
    { 'pnpm-lock.yaml': bigLockfile({ other: '1.0.1' }) },
    true,
    undefined,
    { 'pnpm-lock.yaml': bigLockfile() },
  ],
  [
    'requires a bump for a changed mqtt version in a lockfile larger than 1 MiB',
    { 'pnpm-lock.yaml': bigLockfile({ mqtt: '5.16.1' }) },
    false,
    /mqtt 5\.16\.0 → 5\.16\.1/,
    { 'pnpm-lock.yaml': bigLockfile() },
  ],
]) {
  test(name, () => {
    const directory = mkdtempSync(join(tmpdir(), 'cc100-version-check-'));
    const env = fixtureGitEnv();
    const git = (...args) => execFileSync('git', args, { cwd: directory, env, encoding: 'utf8' }).trim();
    const file = (path, content) => {
      mkdirSync(join(directory, path, '..'), { recursive: true });
      writeFileSync(join(directory, path), content);
    };
    try {
      git('init', '--quiet');
      git('config', 'user.email', 'test@example.com');
      git('config', 'user.name', 'Test');
      git('config', 'commit.gpgsign', 'false');
      file(manifest, JSON.stringify({ runtimeVersion: '0.2.0' }));
      file(runtimePackage, JSON.stringify({ dependencies: { mqtt: '^5.15.2' } }));
      file('pnpm-lock.yaml', lockfile());
      file('package.json', rootPackage());
      for (const [path, content] of Object.entries(baseline ?? {})) file(path, content);
      git('add', '.');
      git('commit', '--quiet', '-m', 'baseline');
      const base = git('rev-parse', 'HEAD');
      for (const [path, content] of Object.entries(files)) file(path, content);
      git('add', '.');
      git('commit', '--quiet', '-m', 'change');
      const run = () =>
        execFileSync(process.execPath, [script, base], { cwd: directory, env, encoding: 'utf8', stdio: 'pipe' });
      if (pass) assert.match(run(), /No WAGO/);
      else
        assert.throws(run, (error) => {
          assert.equal(error.status, 1);
          assert.match(error.stderr, /source changed without increasing the version/);
          assert.match(error.stderr, message);
          return true;
        });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
