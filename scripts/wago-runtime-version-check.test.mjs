import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { fixtureGitEnv } from './test-utils/git-env.mjs';
import {
  buildRuntimeAt,
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
    'apps/plugins/wago/scripts/build-owned-runtime.mjs',
    'apps/plugins/wago/scripts/package-runtime-artifact.mjs',
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
    '.pnpmfile.mjs',
    'patches/mqtt.patch',
    'tsconfig.base.json',
    'nx.json',
    'apps/plugins/wago/diagnostics-types.ts',
    // Not runtime sources, but built and compared like any other WAGO file.
    'apps/plugins/wago/cc100-runtime/src/simulator.ts',
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

test('normalizes esbuild module path comments and pnpm store directories only', () => {
  assert.equal(normalizeBundle(bundle()), 'run();\n// a comment with spaces stays\n');
  assert.equal(normalizeBundle(bundle('apps/plugins/wago/cc100-runtime/src/main.ts')), normalizeBundle(bundle()));
  assert.equal(normalizeBundle('  // indented/path\nx();'), '  // indented/path\nx();');
  // A `// a/b` line inside a template literal is data, not a module path comment.
  assert.equal(normalizeBundle('const s = `\n// see/docs\n`;'), 'const s = `\n// see/docs\n`;');
  const key = (directory) => `  "node_modules/.pnpm/${directory}/node_modules/debug/src/node.js"(exports2, module2) {`;
  assert.equal(
    normalizeBundle(key('debug@4.4.3_supports-color@7.2.0')),
    normalizeBundle(key('debug@4.4.3_supports-color@8.1.1')),
  );
  assert.equal(normalizeBundle(key('debug@4.4.3')), '  "node_modules/debug/src/node.js"(exports2, module2) {');
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

const shipped = ({
  main = bundle(),
  mainFile = 'main.cjs',
  version = '0.2.0',
  runtime = 'x',
  extra = {},
  dockerfile = 'FROM node',
} = {}) => {
  const directory = mkdtempSync(join(tmpdir(), 'cc100-shipped-'));
  const write = (path, content) => {
    mkdirSync(join(directory, path, '..'), { recursive: true });
    writeFileSync(join(directory, path), content);
  };
  write(`dist/apps/wago-cc100-runtime/${mainFile}`, main);
  write('dist/apps/wago-cc100-runtime/package.json', '{"main":"./main.cjs"}');
  for (const [path, content] of Object.entries(extra)) write(`dist/apps/wago-cc100-runtime/${path}`, content);
  write('apps/plugins/wago/cc100-runtime/Dockerfile', dockerfile);
  write('apps/plugins/wago/cc100-runtime/manifest.json', JSON.stringify({ runtimeVersion: version, runtime }));
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
  assert.notEqual(hashShippedRuntime(shipped({ runtime: 'y' })), reference);
  assert.notEqual(hashShippedRuntime(shipped({ mainFile: 'index.cjs' })), reference);
  assert.notEqual(
    hashShippedRuntime(shipped({ extra: { 'chunks/a.cjs': 'a();' } })),
    hashShippedRuntime(shipped({ extra: { 'chunks/a.cjs': 'b();' } })),
  );
});

/**
 * Run the check in a temporary repository: `baseline` is committed, then `files` are changed (null deletes) in a second
 * commit. `baseAdvance` files are committed on the base side after the fork, so `base` is not the merge-base.
 */
function withRepository({ baseline = {}, files, version = '0.2.0', baseAdvance }, check) {
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
    const ancestor = git('rev-parse', 'HEAD');
    for (const [path, content] of Object.entries(files))
      if (content === null) rmSync(join(directory, path));
      else file(path, content);
    if (version !== '0.2.0') file(manifest, JSON.stringify({ runtimeVersion: version }));
    git('add', '-A');
    git('commit', '--quiet', '-m', 'change');
    let base = ancestor;
    if (baseAdvance) {
      const head = git('rev-parse', 'HEAD');
      git('checkout', '--quiet', '--detach', ancestor);
      for (const [path, content] of Object.entries(baseAdvance)) file(path, content);
      git('add', '-A');
      git('commit', '--quiet', '-m', 'base moved on');
      base = git('rev-parse', 'HEAD');
      git('checkout', '--quiet', '--detach', head);
    }
    process.chdir(directory);
    process.env = env;
    return check({ base, ancestor, directory });
  } finally {
    process.chdir(previous.cwd);
    process.env = previous.env;
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Fake build: the merge-base ships `before`, HEAD ships `after`. Records which revisions were built. */
const fakeBuild = (before, after) => {
  const calls = [];
  const revisions = [];
  const build = (rev) => {
    calls.push(rev === 'HEAD' ? 'HEAD' : 'merge-base');
    revisions.push(rev);
    const result = rev === 'HEAD' ? after : before;
    if (result instanceof Error) throw result;
    return result;
  };
  return { build, calls, revisions };
};
const quiet = () => undefined;
const check = (base, build) => checkRuntimeVersion(base, { build, log: quiet });

for (const [name, files] of [
  ['.nvmrc only', { '.nvmrc': '24.22.2\n' }],
  ['a CI workflow only', { '.github/workflows/wago-cc100-runtime.yml': 'name: x' }],
  ['a CI action only', { '.github/actions/build-cc100-runtime/action.yml': 'name: x' }],
  ['frontend, API and docs only', { 'apps/frontend/src/a.ts': 'x', 'docs/en/a.md': 'x' }],
  ['wago docs and specs only', { 'apps/plugins/wago/README.md': 'x', 'apps/plugins/wago/backend/a.spec.ts': 'x' }],
]) {
  test(`does not build or require a bump for ${name}`, () =>
    withRepository({ files }, ({ base }) => {
      const { build, calls } = fakeBuild(new Error('must not build'), new Error('must not build'));
      assert.equal(check(base, build), 'No WAGO CC100 runtime source changes detected.');
      assert.deepEqual(calls, []);
    }));
}

for (const [name, files] of [
  ['a packageManager change', { 'package.json': '{"packageManager":"pnpm@10.34.9"}' }],
  ['a root override for a non-runtime package', { 'package.json': '{"pnpm":{"overrides":{"react":"19.3.1"}}}' }],
  ['a lockfile change', { 'pnpm-lock.yaml': 'lockfileVersion: 9.0\n---\nanything' }],
  ['a tsconfig.base.json alias', { 'tsconfig.base.json': '{"compilerOptions":{"paths":{}}}' }],
  ['a simulator-only change', { 'apps/plugins/wago/cc100-runtime/src/simulator.ts': 'x' }],
]) {
  test(`builds both sides for ${name} and passes when the shipped runtime is equal`, () =>
    withRepository({ files }, ({ base }) => {
      const same = shipped();
      const { build, calls } = fakeBuild(same, shipped());
      assert.match(
        check(base, build),
        /^Built WAGO CC100 runtime is unchanged \(hash [0-9a-f]{12}\); no version increase required\.$/,
      );
      assert.deepEqual(calls, ['merge-base', 'HEAD']);
    }));
}

test('requires a bump when the built output differs and names the hash change and files', () =>
  withRepository({ files: { 'pnpm-lock.yaml': 'changed' } }, ({ base }) => {
    const { build } = fakeBuild(shipped(), shipped({ main: bundle(undefined, 'other();') }));
    assert.throws(
      () => check(base, build),
      (error) => {
        const [first, ...rest] = error.message.split('\n');
        assert.equal(
          first,
          'WAGO CC100 runtime source changed without increasing the version in apps/plugins/wago/cc100-runtime/manifest.json.',
        );
        assert.match(
          rest.join('\n'),
          /^Built WAGO CC100 runtime changed \(hash [0-9a-f]{12} → [0-9a-f]{12}\)\. Changed shipped files:\n {2}dist\/apps\/wago-cc100-runtime\/main\.cjs$/,
        );
        return true;
      },
    );
  }));

test('accepts a higher runtimeVersion alongside candidate changes without building', () =>
  withRepository({ files: { 'pnpm-lock.yaml': 'changed' }, version: '0.2.1' }, ({ base }) => {
    const { build, calls } = fakeBuild(new Error('must not build'), new Error('must not build'));
    // The runtimeVersion bump itself is a manifest path change, which is source without building.
    assert.equal(check(base, build), 'WAGO CC100 runtime source changed and the version was increased.');
    assert.deepEqual(calls, []);
  }));

test('builds the merge-base, not the base tip, when the base branch moved on', () =>
  withRepository(
    { files: { 'pnpm-lock.yaml': 'changed' }, baseAdvance: { 'apps/frontend/a.ts': 'x' } },
    ({ base, ancestor }) => {
      assert.notEqual(base, ancestor);
      const { build, revisions } = fakeBuild(shipped(), shipped());
      check(base, build);
      assert.deepEqual(revisions, [ancestor, 'HEAD']);
    },
  ));

test('requires a bump when a host deployment file is renamed', () =>
  withRepository(
    {
      baseline: { 'apps/plugins/wago/backend/runtime/update/shell.ts': 'a\nb\nc\nd\ne\n' },
      files: {
        'apps/plugins/wago/backend/runtime/update/shell.ts': null,
        'apps/plugins/wago/backend/runtime/update/shell-script.ts': 'a\nb\nc\nd\ne\nf\n',
      },
    },
    ({ base }) => {
      const { build, calls } = fakeBuild(new Error('must not build'), new Error('must not build'));
      assert.throws(() => check(base, build), /increasing the version[\s\S]*backend\/runtime\/update\/shell\.ts/);
      assert.deepEqual(calls, []);
    },
  ));

test('ignores a runtimeVersion-only and a path-comment-only difference between the builds', () =>
  withRepository({ files: { 'pnpm-lock.yaml': 'changed' } }, ({ base }) => {
    const { build } = fakeBuild(
      shipped(),
      shipped({ version: '7.7.7', main: bundle('node_modules/.pnpm/mqtt@5.16.1_x/node_modules/mqtt/index.js') }),
    );
    assert.match(
      check(base, build),
      /^Built WAGO CC100 runtime is unchanged \(hash [0-9a-f]{12}\); no version increase required\.$/,
    );
  }));

for (const path of [
  'apps/plugins/wago/cc100-runtime/src/runtime.ts',
  'apps/plugins/wago/backend/runtime/install.ts',
  'apps/plugins/wago/cc100-runtime/Dockerfile',
]) {
  test(`requires a bump without building for ${path}`, () =>
    withRepository({ files: { [path]: 'changed', 'pnpm-lock.yaml': 'changed' } }, ({ base }) => {
      const { build, calls } = fakeBuild(new Error('must not build'), new Error('must not build'));
      assert.throws(() => check(base, build), new RegExp(`increasing the version[\\s\\S]*${path}`));
      assert.deepEqual(calls, []);
    }));
}

for (const [side, before, after] of [
  ['merge-base', new Error('pnpm install failed'), shipped()],
  ['HEAD', shipped(), new Error('nx build failed')],
  ['merge-base', new Error('pnpm install failed'), new Error('nx build failed')],
]) {
  test(`fails with a ${side}-specific message when the build fails`, () =>
    withRepository({ files: { 'package.json': '{"a":1}' } }, ({ base }) => {
      const { build } = fakeBuild(before, after);
      assert.throws(
        () => check(base, build),
        (error) => {
          assert.match(
            error.message,
            new RegExp(
              `^Could not build the WAGO CC100 runtime at ${side} \\((?:[0-9a-f]{12}|HEAD)\\): (pnpm install|nx build) failed\\n` +
                'Fix the build, or increase runtimeVersion',
            ),
          );
          return true;
        },
      );
    }));
}

/** A fake `pnpm` that logs its calls and "builds" a dist that embeds the checkout's runtimeVersion. */
function withFakePnpm(run) {
  const bin = mkdtempSync(join(tmpdir(), 'cc100-fake-pnpm-'));
  const log = join(bin, 'calls.log');
  writeFileSync(
    join(bin, 'pnpm'),
    [
      '#!/bin/sh',
      'echo "$PWD|$*|$NX_SKIP_REMOTE_CACHE|${NX_SELF_HOSTED_REMOTE_CACHE_SERVER:-unset}" >> "$FAKE_PNPM_LOG"',
      'if [ "$1" = install ]; then',
      '  [ -n "$FAKE_FAIL_INSTALL" ] && { echo "noise"; echo "ERR_PNPM_LOCKFILE broken" >&2; exit 1; }',
      '  exit 0',
      'fi',
      'v=$(node -p "require(\'./apps/plugins/wago/cc100-runtime/manifest.json\').runtimeVersion")',
      'mkdir -p dist/apps/wago-cc100-runtime/chunks',
      'printf \'// node_modules/.pnpm/x@1/index.js\\nconst v="%s";\\n\' "$v" > dist/apps/wago-cc100-runtime/main.cjs',
      'echo nested > dist/apps/wago-cc100-runtime/chunks/a.cjs',
      '',
    ].join('\n'),
  );
  chmodSync(join(bin, 'pnpm'), 0o755);
  const previous = { ...process.env };
  Object.assign(process.env, {
    PATH: `${bin}:${process.env.PATH}`,
    FAKE_PNPM_LOG: log,
    NX_SELF_HOSTED_REMOTE_CACHE_SERVER: 'https://cache.invalid',
  });
  try {
    return run(() => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []));
  } finally {
    process.env = previous;
    rmSync(bin, { recursive: true, force: true });
  }
}

const worktreeCount = (directory) =>
  execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: directory, encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.startsWith('worktree ')).length;

test('buildRuntimeAt builds each side in a cleaned-up worktree with a fixed runtimeVersion and no cache', () =>
  withRepository(
    { baseline: { 'apps/plugins/wago/cc100-runtime/Dockerfile': 'FROM node' }, files: {}, version: '0.3.0' },
    ({ ancestor, directory }) =>
      withFakePnpm((calls) => {
        const before = buildRuntimeAt(ancestor);
        const after = buildRuntimeAt('HEAD');
        assert.equal(hashShippedRuntime(before), hashShippedRuntime(after), 'the version bump must not count');
        assert.deepEqual([...after.keys()].sort(), [
          'apps/plugins/wago/cc100-runtime/Dockerfile',
          'apps/plugins/wago/cc100-runtime/manifest.json (without runtimeVersion)',
          'dist/apps/wago-cc100-runtime/chunks/a.cjs',
          'dist/apps/wago-cc100-runtime/main.cjs',
        ]);
        assert.equal(after.get('dist/apps/wago-cc100-runtime/main.cjs'), 'const v="0.0.0";\n');
        const lines = calls().map((line) => line.split('|'));
        assert.deepEqual(
          lines.map(([, args, skipRemote, server]) => [args, skipRemote, server]),
          [1, 2].flatMap(() => [
            ['install --frozen-lockfile', 'true', 'unset'],
            ['nx run plugin-wago:build-cc100-runtime --skip-nx-cache --output-style=static', 'true', 'unset'],
          ]),
        );
        for (const [checkout] of lines) assert.equal(existsSync(checkout), false, `${checkout} was removed`);
        assert.equal(worktreeCount(directory), 1);
        assert.equal(JSON.parse(readFileSync(join(directory, manifest), 'utf8')).runtimeVersion, '0.3.0');
      }),
  ));

test('buildRuntimeAt reports the failing command with its output tail and still cleans up', () =>
  withRepository({ files: { 'apps/frontend/a.ts': 'x' } }, ({ directory }) =>
    withFakePnpm((calls) => {
      process.env.FAKE_FAIL_INSTALL = '1';
      assert.throws(() => buildRuntimeAt('HEAD'), {
        message: 'pnpm install --frozen-lockfile failed:\nnoise\nERR_PNPM_LOCKFILE broken',
      });
      const [checkout] = calls()[0].split('|');
      assert.equal(existsSync(checkout), false);
      assert.equal(worktreeCount(directory), 1);
    }),
  ));
