import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { fixtureGitEnv } from './test-utils/git-env.mjs';
import { isRuntimeSource } from './check-wago-runtime-version.mjs';
import { stringify } from 'yaml';

const script = fileURLToPath(new URL('./check-wago-runtime-version.mjs', import.meta.url));
const manifest = 'apps/plugins/wago/cc100-runtime/manifest.json';
const source = 'apps/plugins/wago/cc100-runtime/src/runtime.ts';

// Exercise the committed-file gate, including direct and transitive resolutions.
const dependencyRoots = ['mqtt', 'ipaddr.js', 'nx', '@nx/esbuild', 'esbuild', 'typescript'];
function dependencyFixture() {
  return {
    lockfileVersion: '9.0',
    importers: {
      '.': {
        dependencies: Object.fromEntries(
          dependencyRoots.map((name) => [name, { specifier: '^1.0.0', version: '1.0.0' }]),
        ),
      },
    },
    packages: Object.fromEntries(
      [...dependencyRoots, 'transitive', 'optional', 'unrelated'].map((name) => [
        `${name}@1.0.0`,
        { resolution: { integrity: 'original' } },
      ]),
    ),
    snapshots: {
      ...Object.fromEntries(dependencyRoots.map((name) => [`${name}@1.0.0`, {}])),
      'mqtt@1.0.0': { dependencies: { transitive: '1.0.0' } },
      'esbuild@1.0.0': { optionalDependencies: { optional: '1.0.0' } },
      'transitive@1.0.0': {},
      'optional@1.0.0': {},
      'unrelated@1.0.0': {},
    },
  };
}

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
    'pnpm-lock.yaml',
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
  ['allows an unrelated dependency addition', 'unrelated-dependency', '0.2.0', true],
  ['allows unrelated lockfile resolution edits', 'unrelated-resolution', '0.2.0', true],
  ['handles lockfiles larger than the subprocess default buffer', 'large-lockfile', '0.2.0', true],
  ['requires a bump for a bundled dependency', 'runtime-dependency', '0.2.0', false],
  ['requires a bump for a transitive dependency', 'transitive-dependency', '0.2.0', false],
  ['requires a bump for an optional build dependency', 'build-dependency', '0.2.0', false],
  ['requires a bump for a direct build tool', 'build-tool', '0.2.0', false],
  ['requires a bump for install policy', 'install-policy', '0.2.0', false],
  ['rejects an unsupported lockfile', 'unsupported-lockfile', '0.2.1', false],
  ['accepts a bump for relevant dependency edits', 'transitive-dependency', '0.2.1', true],
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
      const packageJson = { packageManager: 'pnpm@10.34.6' };
      const lock = dependencyFixture();
      file('package.json', JSON.stringify(packageJson));
      file('pnpm-lock.yaml', stringify(lock));
      git('add', '.');
      git('commit', '--quiet', '-m', 'baseline');
      const base = git('rev-parse', 'HEAD');
      if (path === 'unrelated-dependency') {
        packageJson.devDependencies = { yaml: '^2.9.1' };
        lock.importers['.'].devDependencies = { yaml: { specifier: '^2.9.1', version: '2.9.1' } };
        lock.packages['yaml@2.9.1'] = { resolution: { integrity: 'new' } };
        lock.snapshots['yaml@2.9.1'] = {};
      } else if (path === 'large-lockfile') lock.packages['unrelated@1.0.0'].description = 'x'.repeat(1024 * 1024);
      else if (path === 'unrelated-resolution') lock.packages['unrelated@1.0.0'].resolution.integrity = 'changed';
      else if (path === 'runtime-dependency') lock.packages['mqtt@1.0.0'].resolution.integrity = 'changed';
      else if (path === 'transitive-dependency') lock.packages['transitive@1.0.0'].resolution.integrity = 'changed';
      else if (path === 'build-dependency') lock.packages['optional@1.0.0'].resolution.integrity = 'changed';
      else if (path === 'build-tool') lock.importers['.'].dependencies.esbuild.specifier = '~1.0.0';
      else if (path === 'install-policy') packageJson.packageManager = 'pnpm@11.0.0';
      else if (path === 'unsupported-lockfile') lock.lockfileVersion = '10.0';
      else file(path, 'changed');
      file('package.json', JSON.stringify(packageJson));
      file('pnpm-lock.yaml', stringify(lock));
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
