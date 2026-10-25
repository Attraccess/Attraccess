import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { fixtureGitEnv } from './test-utils/git-env.mjs';
import { runtimeDependencies } from './lib/wago-runtime-dependencies.mjs';
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
  ['allows unrelated override declarations', 'unrelated-override', '0.2.0', true],
  ['allows removing a redundant frontend override', 'remove-override', '0.2.0', true],
  ['requires a bump when an override changes a runtime resolution', 'runtime-override', '0.2.0', false],
  ['allows unrelated patch declarations', 'unrelated-patch', '0.2.0', true],
  ['allows unchanged aliased dependencies', 'alias-unchanged', '0.2.0', true],
  ['requires a bump for an aliased transitive dependency', 'alias-change', '0.2.0', false],
  ['accepts a bump for an aliased transitive dependency', 'alias-change', '0.2.1', true],
  ['requires a bump for an applied runtime patch', 'runtime-patch', '0.2.0', false],
  ['requires a bump for global install settings', 'global-install-policy', '0.2.0', false],
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
      const packageJson = { packageManager: 'pnpm@10.34.6', pnpm: { overrides: { react: '1.0.0' } } };
      const lock = dependencyFixture();
      lock.overrides = { react: '1.0.0' };
      if (path.startsWith('alias-')) {
        lock.snapshots['mqtt@1.0.0'].dependencies['string-width-cjs'] = 'string-width@4.2.3';
        lock.packages['string-width@4.2.3'] = { resolution: { integrity: 'original' } };
        lock.snapshots['string-width@4.2.3'] = {};
      }
      file('package.json', JSON.stringify(packageJson));
      file('pnpm-lock.yaml', stringify(lock));
      git('add', '.');
      git('commit', '--quiet', '-m', 'baseline');
      const base = git('rev-parse', 'HEAD');
      if (path === 'alias-change') lock.packages['string-width@4.2.3'].resolution.integrity = 'changed';
      else if (path.endsWith('-override')) {
        if (path === 'remove-override') {
          delete packageJson.pnpm.overrides.react;
          delete lock.overrides.react;
        } else {
          const name = path === 'runtime-override' ? 'transitive' : 'absent-package';
          packageJson.pnpm.overrides[name] = '2.0.0';
          lock.overrides[name] = '2.0.0';
          if (path === 'runtime-override') {
            lock.snapshots['mqtt@1.0.0'].dependencies.transitive = '2.0.0';
            lock.packages['transitive@2.0.0'] = { resolution: { integrity: 'new' } };
            lock.snapshots['transitive@2.0.0'] = {};
          }
        }
      } else if (path.endsWith('-patch')) {
        const name = path === 'runtime-patch' ? 'mqtt' : 'unrelated';
        const key = `${name}@1.0.0`;
        packageJson.pnpm.patchedDependencies = { [key]: `patches/${name}.patch` };
        file(`patches/${name}.patch`, 'patch content');
        lock.patchedDependencies = { [key]: { hash: 'patch-content-hash', path: `patches/${name}.patch` } };
        lock.snapshots[`${key}(patch_hash=patch-content-hash)`] = lock.snapshots[key];
        delete lock.snapshots[key];
        if (path === 'runtime-patch')
          lock.importers['.'].dependencies.mqtt.version += '(patch_hash=patch-content-hash)';
      } else if (path === 'global-install-policy') packageJson.pnpm.strictDepBuilds = true;
      else if (path === 'unrelated-dependency') {
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

for (const relevant of [false, true]) {
  for (const operation of ['add', 'edit', 'remove']) {
    test(`${operation} ${relevant ? 'runtime' : 'unrelated'} patch file ${relevant ? 'requires' : 'does not require'} a bump`, () => {
      const directory = mkdtempSync(join(tmpdir(), 'cc100-patch-check-'));
      const env = fixtureGitEnv();
      const git = (...args) => execFileSync('git', args, { cwd: directory, env, encoding: 'utf8' }).trim();
      const file = (path, content) => {
        mkdirSync(join(directory, path, '..'), { recursive: true });
        writeFileSync(join(directory, path), content);
      };
      const name = relevant ? 'mqtt' : 'unrelated';
      const patchPath = `patches/${name}.patch`;
      const key = `${name}@1.0.0`;
      const lock = dependencyFixture();
      const packageJson = { pnpm: { patchedDependencies: {} } };
      const setPatched = (enabled) => {
        packageJson.pnpm.patchedDependencies = enabled ? { [key]: patchPath } : {};
        lock.patchedDependencies = enabled ? { [key]: { hash: 'patch-hash', path: patchPath } } : {};
        const oldKey = Object.keys(lock.snapshots).find((entry) => entry.split('(')[0] === key);
        const snapshot = lock.snapshots[oldKey];
        delete lock.snapshots[oldKey];
        lock.snapshots[enabled ? `${key}(patch_hash=patch-hash)` : key] = snapshot;
        if (relevant)
          lock.importers['.'].dependencies.mqtt.version = enabled ? '1.0.0(patch_hash=patch-hash)' : '1.0.0';
        if (enabled) file(patchPath, 'original patch');
        else rmSync(join(directory, patchPath), { force: true });
        file('package.json', JSON.stringify(packageJson));
        file('pnpm-lock.yaml', stringify(lock));
      };
      try {
        git('init', '--quiet');
        git('config', 'user.email', 'test@example.com');
        git('config', 'user.name', 'Test');
        git('config', 'commit.gpgsign', 'false');
        file(manifest, JSON.stringify({ runtimeVersion: '0.2.0' }));
        setPatched(operation !== 'add');
        git('add', '.');
        git('commit', '--quiet', '-m', 'baseline');
        const base = git('rev-parse', 'HEAD');
        if (operation === 'edit') file(patchPath, 'changed patch');
        else setPatched(operation === 'add');
        git('add', '.');
        git('commit', '--quiet', '-m', 'change');
        if (relevant)
          assert.throws(() => execFileSync(process.execPath, [script, base], { cwd: directory, env, stdio: 'pipe' }));
        else
          assert.match(
            execFileSync(process.execPath, [script, base], { cwd: directory, env, encoding: 'utf8' }),
            /No WAGO/,
          );
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
}

test('resolves scoped, unscoped and optional aliases with peer suffixes', () => {
  const lock = dependencyFixture();
  lock.snapshots['mqtt@1.0.0'].dependencies.alias = 'string-width@4.2.3';
  lock.snapshots['esbuild@1.0.0'].optionalDependencies.alias = '@scope/pkg@2.0.0(peer@1.0.0)';
  lock.importers['.'].dependencies.typescript.version = '1.0.0(peer@1.0.0)';
  lock.snapshots['typescript@1.0.0(peer@1.0.0)'] = lock.snapshots['typescript@1.0.0'];
  delete lock.snapshots['typescript@1.0.0'];
  lock.packages['string-width@4.2.3'] = {};
  lock.snapshots['string-width@4.2.3'] = {};
  lock.packages['@scope/pkg@2.0.0'] = {};
  lock.snapshots['@scope/pkg@2.0.0(peer@1.0.0)'] = {};
  const result = runtimeDependencies((path) => (path === 'package.json' ? '{}' : stringify(lock)));
  assert.ok(Object.hasOwn(result.snapshots, 'string-width@4.2.3'));
  assert.ok(Object.hasOwn(result.snapshots, '@scope/pkg@2.0.0(peer@1.0.0)'));
});

for (const kind of ['dependencies', 'optionalDependencies']) {
  test(`tracks same-version peer resolution changes through snapshot ${kind}`, () => {
    // pnpm v9 records resolved peers as ordinary/optional snapshot edges as
    // well as in the contextual key. Peer version declarations are ranges,
    // not additional resolved edges to parse from package metadata.
    const lock = dependencyFixture();
    const key = 'mqtt@1.0.0(@scope/peer@1.0.0)';
    lock.importers['.'].dependencies.mqtt.version = '1.0.0(@scope/peer@1.0.0)';
    lock.packages['mqtt@1.0.0'].peerDependencies = { '@scope/peer': '^1.0.0' };
    lock.snapshots[key] = { [kind]: { '@scope/peer': '1.0.0' } };
    delete lock.snapshots['mqtt@1.0.0'];
    lock.packages['@scope/peer@1.0.0'] = { resolution: { integrity: 'original' } };
    lock.snapshots['@scope/peer@1.0.0'] = {};
    const collect = () => runtimeDependencies((path) => (path === 'package.json' ? '{}' : stringify(lock)));
    const before = collect();
    assert.equal(before.packages['@scope/peer@1.0.0'].resolution.integrity, 'original');
    lock.packages['@scope/peer@1.0.0'].resolution.integrity = 'changed-without-version-bump';
    assert.notDeepEqual(collect(), before);
  });
}

for (const invalid of ['unsupported', 'missing']) {
  for (const location of ['baseline', 'head']) {
    for (const editSource of [false, true]) {
      test(`rejects ${invalid} dependency records in ${location} with ${editSource ? 'source and version' : 'version only'} changes`, () => {
        const directory = mkdtempSync(join(tmpdir(), 'cc100-invalid-records-'));
        const env = fixtureGitEnv();
        const git = (...args) => execFileSync('git', args, { cwd: directory, env, encoding: 'utf8' }).trim();
        const file = (path, content) => {
          mkdirSync(join(directory, path, '..'), { recursive: true });
          writeFileSync(join(directory, path), content);
        };
        const lock = dependencyFixture();
        const invalidate = () => {
          if (invalid === 'unsupported') lock.lockfileVersion = '10.0';
          else delete lock.snapshots['transitive@1.0.0'];
        };
        try {
          git('init', '--quiet');
          git('config', 'user.email', 'test@example.com');
          git('config', 'user.name', 'Test');
          git('config', 'commit.gpgsign', 'false');
          file(manifest, JSON.stringify({ runtimeVersion: '0.2.0' }));
          file(source, 'baseline');
          file('package.json', '{}');
          if (location === 'baseline') invalidate();
          file('pnpm-lock.yaml', stringify(lock));
          git('add', '.');
          git('commit', '--quiet', '-m', 'baseline');
          const base = git('rev-parse', 'HEAD');
          if (location === 'head') {
            invalidate();
            file('pnpm-lock.yaml', stringify(lock));
          }
          if (editSource) file(source, 'changed');
          file(manifest, JSON.stringify({ runtimeVersion: '0.2.1' }));
          git('add', '.');
          git('commit', '--quiet', '-m', 'bump');
          assert.throws(
            () => execFileSync(process.execPath, [script, base], { cwd: directory, env, stdio: 'pipe' }),
            (error) => {
              assert.equal(error.status, 1);
              assert.match(
                error.stderr.toString(),
                invalid === 'unsupported'
                  ? /Unsupported CC100 dependency lockfile/
                  : /Missing CC100 dependency: transitive@1\.0\.0/,
              );
              return true;
            },
          );
        } finally {
          rmSync(directory, { recursive: true, force: true });
        }
      });
    }
  }
}
