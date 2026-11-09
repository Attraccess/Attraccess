import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { fixtureGitEnv } from './test-utils/git-env.mjs';
import {
  checkRuntimeVersion,
  failureTail,
  hashShippedRuntime,
  isBuildCandidate,
  isRuntimeSource,
  normalizeBundle,
  readShippedRuntime,
} from './check-wago-runtime-version.mjs';

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
    'apps/plugins/wago/scripts/docker-image-identity.mjs',
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
    // Repo-root and CI files are decided by the built output, see the cases below.
    'pnpm-lock.yaml',
    'package.json',
    'pnpm-workspace.yaml',
    'nx.json',
    'tsconfig.base.json',
    '.npmrc',
    '.nvmrc',
    '.dockerignore',
    '.pnpmfile.cjs',
    'patches/mqtt@5.16.0.patch',
    '.github/actions/build-cc100-runtime/action.yml',
    '.github/workflows/wago-cc100-runtime.yml',
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

test('treats only files that can influence the bundle as build candidates', () => {
  for (const path of [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.npmrc',
    '.pnpmfile.cjs',
    'patches/mqtt.patch',
    'tsconfig.base.json',
    'nx.json',
    'apps/plugins/wago/diagnostics-types.ts',
  ])
    assert.equal(isBuildCandidate(path), true, path);
  for (const path of [
    '.nvmrc',
    '.dockerignore',
    '.github/workflows/wago-cc100-runtime.yml',
    '.github/actions/build-cc100-runtime/action.yml',
    'apps/frontend/src/index.ts',
    'docs/en/devices/wago-cc100-runtime.md',
    'apps/plugins/wago/backend/runtime/install.spec.ts',
    'apps/plugins/wago/README.md',
  ])
    assert.equal(isBuildCandidate(path), false, path);
});

const bundle = (modulePath = 'node_modules/.pnpm/mqtt@5.16.0/node_modules/mqtt/index.js', code = 'run();') =>
  `// ${modulePath}\n${code}\n// a comment with spaces stays\n`;

test('normalizes esbuild module path comments only', () => {
  assert.equal(normalizeBundle(bundle()), 'run();\n// a comment with spaces stays\n');
  assert.equal(normalizeBundle('  // indented/path\nx();'), '  // indented/path\nx();');
});

test('keeps the actual error in a failed command tail, without colour codes, blanks and vite config warnings', () => {
  const warning = [
    "\x1b[33m(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`:",
    '  - `__dirname` (vite.config.ts:24:9). Use `import.meta.dirname` instead',
    'Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.\x1b[39m',
    '',
  ].join('\n');
  const output = `${warning.repeat(30)}\n\x1b[1m\x1b[31m NX \x1b[39m\x1b[22m ts.createProgram is not a function\n\n  Run duration: 3s\n`;
  assert.equal(failureTail(output), ' NX  ts.createProgram is not a function\n  Run duration: 3s');
  assert.equal(failureTail('a\nb\nc\nd', 2), 'c\nd');
});

const shipped = ({ main = bundle(), version = '0.2.0', extra = {}, dockerfile = 'FROM node' } = {}) => {
  const directory = mkdtempSync(join(tmpdir(), 'cc100-shipped-'));
  const write = (path, content) => {
    mkdirSync(join(directory, path, '..'), { recursive: true });
    writeFileSync(join(directory, path), content);
  };
  write('dist/apps/wago-cc100-runtime/main.cjs', main);
  write('dist/apps/wago-cc100-runtime/package.json', '{"main":"./main.cjs"}');
  for (const [path, content] of Object.entries(extra)) write(`dist/apps/wago-cc100-runtime/${path}`, content);
  write('apps/plugins/wago/cc100-runtime/Dockerfile', dockerfile);
  write('apps/plugins/wago/cc100-runtime/manifest.json', JSON.stringify({ runtimeVersion: version, runtime: 'x' }));
  try {
    return readShippedRuntime(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

test('the shipped-runtime hash ignores runtimeVersion and esbuild path comments but not code', () => {
  const reference = hashShippedRuntime(shipped());
  assert.equal(hashShippedRuntime(shipped({ version: '9.9.9' })), reference);
  assert.equal(
    hashShippedRuntime(shipped({ main: bundle('node_modules/.pnpm/mqtt@5.16.0_peer-abc/x.js') })),
    reference,
  );
  assert.notEqual(hashShippedRuntime(shipped({ main: bundle(undefined, 'run2();') })), reference);
  assert.notEqual(hashShippedRuntime(shipped({ extra: { 'extra.cjs': 'x' } })), reference);
  assert.notEqual(hashShippedRuntime(shipped({ dockerfile: 'FROM other' })), reference);
});

/** Run the check in a temporary repository: `baseline` is committed, then `files` are changed in a second commit. */
function withRepository({ baseline = {}, files, version = '0.2.0' }, check) {
  const directory = mkdtempSync(join(tmpdir(), 'cc100-version-check-'));
  const env = fixtureGitEnv();
  const git = (...args) => execFileSync('git', args, { cwd: directory, env, encoding: 'utf8' }).trim();
  const file = (path, content) => {
    mkdirSync(join(directory, path, '..'), { recursive: true });
    writeFileSync(join(directory, path), content);
  };
  const previous = { cwd: process.cwd(), env: process.env };
  try {
    git('init', '--quiet');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    git('config', 'commit.gpgsign', 'false');
    file(manifest, JSON.stringify({ runtimeVersion: '0.2.0' }));
    file('package.json', '{}');
    for (const [path, content] of Object.entries(baseline)) file(path, content);
    git('add', '.');
    git('commit', '--quiet', '-m', 'baseline');
    const base = git('rev-parse', 'HEAD');
    for (const [path, content] of Object.entries(files)) file(path, content);
    if (version !== '0.2.0') file(manifest, JSON.stringify({ runtimeVersion: version }));
    git('add', '-A');
    git('commit', '--quiet', '-m', 'change');
    process.chdir(directory);
    process.env = env;
    return check({ base });
  } finally {
    process.chdir(previous.cwd);
    process.env = previous.env;
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Fake build: the merge-base ships `before`, HEAD ships `after`. Records which revisions were built. */
const fakeBuild = (base, before, after, calls = []) => {
  const build = (rev) => {
    calls.push(rev === 'HEAD' ? 'HEAD' : 'merge-base');
    const result = rev === 'HEAD' ? after : before;
    if (result instanceof Error) throw result;
    return result;
  };
  return { build, calls };
};

for (const [name, files] of [
  ['.nvmrc only', { '.nvmrc': '24.22.2\n' }],
  ['a CI workflow only', { '.github/workflows/wago-cc100-runtime.yml': 'name: x' }],
  ['a CI action only', { '.github/actions/build-cc100-runtime/action.yml': 'name: x' }],
  ['frontend, API and docs only', { 'apps/frontend/src/a.ts': 'x', 'docs/en/a.md': 'x' }],
  [
    'wago docs, specs and simulator only (built output equal)',
    { 'apps/plugins/wago/README.md': 'x', 'apps/plugins/wago/backend/a.spec.ts': 'x' },
  ],
]) {
  test(`does not build or require a bump for ${name}`, () =>
    withRepository({ files }, ({ base }) => {
      const { build, calls } = fakeBuild(base, new Error('must not build'), new Error('must not build'));
      assert.equal(checkRuntimeVersion(base, { build }), 'No WAGO CC100 runtime source changes detected.');
      assert.deepEqual(calls, []);
    }));
}

for (const [name, files] of [
  ['a packageManager change', { 'package.json': '{"packageManager":"pnpm@10.34.9"}' }],
  ['a root override for a non-runtime package', { 'package.json': '{"pnpm":{"overrides":{"react":"19.3.1"}}}' }],
  ['a lockfile change', { 'pnpm-lock.yaml': 'lockfileVersion: 9.0\n---\nanything' }],
  ['a tsconfig.base.json alias', { 'tsconfig.base.json': '{"compilerOptions":{"paths":{}}}' }],
]) {
  test(`builds both sides for ${name} and passes when the shipped runtime is equal`, () =>
    withRepository({ files }, ({ base }) => {
      const same = shipped();
      const { build, calls } = fakeBuild(base, same, shipped());
      assert.match(checkRuntimeVersion(base, { build }), /Built CC100 runtime is unchanged/);
      assert.deepEqual(calls, ['merge-base', 'HEAD']);
    }));
}

test('requires a bump when the built output differs and names the hash change and files', () =>
  withRepository({ files: { 'pnpm-lock.yaml': 'changed' } }, ({ base }) => {
    const { build } = fakeBuild(base, shipped(), shipped({ main: bundle(undefined, 'other();') }));
    assert.throws(
      () => checkRuntimeVersion(base, { build }),
      (error) => {
        const [first, ...rest] = error.message.split('\n');
        assert.equal(
          first,
          'WAGO CC100 runtime source changed without increasing the version in apps/plugins/wago/cc100-runtime/manifest.json.',
        );
        assert.match(
          rest.join('\n'),
          /built CC100 runtime changed \(hash [0-9a-f]{12} → [0-9a-f]{12}\).*dist\/main\.cjs/,
        );
        return true;
      },
    );
  }));

test('accepts a higher runtimeVersion when the built output differs', () =>
  withRepository({ files: { 'pnpm-lock.yaml': 'changed' }, version: '0.2.1' }, ({ base }) => {
    const { build } = fakeBuild(base, shipped(), shipped({ main: bundle(undefined, 'other();') }));
    // The runtimeVersion bump itself is a manifest path change, which is source without building.
    assert.equal(
      checkRuntimeVersion(base, { build }),
      'WAGO CC100 runtime source changed and the version was increased.',
    );
  }));

test('ignores a runtimeVersion-only and a path-comment-only difference between the builds', () =>
  withRepository({ files: { 'pnpm-lock.yaml': 'changed' } }, ({ base }) => {
    const { build } = fakeBuild(
      base,
      shipped(),
      shipped({ version: '7.7.7', main: bundle('node_modules/.pnpm/mqtt@5.16.1_x/node_modules/mqtt/index.js') }),
    );
    assert.match(checkRuntimeVersion(base, { build }), /Built CC100 runtime is unchanged/);
  }));

for (const path of [
  'apps/plugins/wago/cc100-runtime/src/runtime.ts',
  'apps/plugins/wago/backend/runtime/install.ts',
  'apps/plugins/wago/cc100-runtime/Dockerfile',
]) {
  test(`requires a bump without building for ${path}`, () =>
    withRepository({ files: { [path]: 'changed', 'pnpm-lock.yaml': 'changed' } }, ({ base }) => {
      const { build, calls } = fakeBuild(base, new Error('must not build'), new Error('must not build'));
      assert.throws(() => checkRuntimeVersion(base, { build }), new RegExp(`increasing the version[\\s\\S]*${path}`));
      assert.deepEqual(calls, []);
    }));
}

for (const [side, before, after] of [
  ['merge-base', new Error('pnpm install failed'), shipped()],
  ['HEAD', shipped(), new Error('nx build failed')],
]) {
  test(`fails with a ${side}-specific message when the build fails`, () =>
    withRepository({ files: { 'package.json': '{"a":1}' } }, ({ base }) => {
      const { build } = fakeBuild(base, before, after);
      assert.throws(
        () => checkRuntimeVersion(base, { build }),
        (error) => {
          assert.match(
            error.message,
            new RegExp(`^could not build CC100 runtime at ${side}: (pnpm install|nx build) failed`),
          );
          return true;
        },
      );
    }));
}
