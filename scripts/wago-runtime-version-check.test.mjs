import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { fixtureGitEnv } from './test-utils/git-env.mjs';
import { isRuntimeSource, parseLockfile, runtimeClosure } from './check-wago-runtime-version.mjs';

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
    '.pnpmfile.cjs',
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
  packetIntegrity = 'sha512-packet',
  babel = '7.29.7',
  types = '8.18.1',
  bufferutil = '4.0.0',
  other = '1.0.0',
  workspaceMqtt = '4.0.0',
  version = '9.0',
  top = '',
  filler = 0,
} = {}) => {
  const packages = [
    `'@babel/runtime@${babel}'`,
    "'@scope/tool@2.0.0'",
    `'@types/ws@${types}'`,
    `bufferutil@${bufferutil}`,
    'debug@4.4.3',
    `mqtt@${mqtt}`,
    `other@${other}`,
  ];
  return `lockfileVersion: '${version}'

settings:
  autoInstallPeers: true
${top}
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

  apps/other:
    dependencies:
      mqtt:
        specifier: ^4.0.0
        version: ${workspaceMqtt}

packages:
${packages.map((key) => `\n  ${key}:\n    resolution: {integrity: sha512-${key.replace(/'/g, '')}}\n`).join('')}
  mqtt-packet@${packet}:
    resolution: {integrity: ${packetIntegrity}}

snapshots:

  '@babel/runtime@${babel}': {}

  '@scope/tool@2.0.0(other@${other})':
    dependencies:
      other: ${other}

  '@types/ws@${types}': {}

  bufferutil@${bufferutil}: {}

  debug@4.4.3(supports-color@7.2.0): {}

  mqtt-packet@${packet}:
    dependencies:
      debug: 4.4.3(supports-color@7.2.0)
    transitivePeerDependencies:
      - supports-color

  mqtt@${mqtt}:
    dependencies:
      '@babel/runtime': ${babel}
      '@types/ws': ${types}
      mqtt-packet: ${packet}
    optionalDependencies:
      bufferutil: ${bufferutil}

  other@${other}: {}
${Array.from({ length: filler }, (_, index) => `\n  filler-package-${index}@1.0.0: {}\n`).join('')}`;
};

// Larger than the 1 MiB default of execFileSync, like the real root lockfile.
const bigLockfile = (options = {}) => lockfile({ filler: 40000, ...options });

const rootPackage = ({
  mqtt = '^5.15.2',
  section = 'dependencies',
  other = '^1.0.0',
  pnpm = {},
  scripts = 'a',
  manager = 'pnpm@10.0.0+sha512.abc',
} = {}) =>
  JSON.stringify({
    scripts: { build: scripts },
    dependencies: { other },
    [section]: { ...(section === 'dependencies' ? { other } : {}), mqtt },
    packageManager: manager,
    pnpm: { overrides: { a: '1', b: '2' }, ...pnpm },
  });

const malformed = (from, to) => lockfile().replace(from, to);

for (const { name, files, pass, message, baseline, cwd } of [
  {
    name: 'allows an unrelated lockfile change',
    files: { 'pnpm-lock.yaml': lockfile({ other: '1.0.1' }) },
    pass: true,
  },
  {
    name: 'allows a type-only change in the mqtt closure',
    files: { 'pnpm-lock.yaml': lockfile({ types: '8.18.2' }) },
    pass: true,
  },
  {
    name: 'allows an mqtt change in another workspace importer',
    files: { 'pnpm-lock.yaml': lockfile({ workspaceMqtt: '4.0.1' }) },
    pass: true,
  },
  {
    name: 'requires a bump for a changed mqtt version',
    files: { 'pnpm-lock.yaml': lockfile({ mqtt: '5.16.1' }) },
    message: /closure changed: mqtt 5\.16\.0 → 5\.16\.1\)$/m,
  },
  {
    name: 'requires a bump for a changed transitive dependency of mqtt',
    files: { 'pnpm-lock.yaml': lockfile({ packet: '9.0.3' }) },
    message: /\(runtime dependency closure changed: mqtt-packet 9\.0\.2 → 9\.0\.3\)$/m,
  },
  {
    name: 'requires a bump for a changed scoped dependency of mqtt',
    files: { 'pnpm-lock.yaml': lockfile({ babel: '7.29.8' }) },
    message: /@babel\/runtime 7\.29\.7 → 7\.29\.8/,
  },
  {
    name: 'requires a bump for a changed optional dependency of mqtt',
    files: { 'pnpm-lock.yaml': lockfile({ bufferutil: '4.0.1' }) },
    message: /bufferutil 4\.0\.0 → 4\.0\.1/,
  },
  {
    name: 'requires a bump for a changed resolution of an mqtt dependency',
    files: { 'pnpm-lock.yaml': lockfile({ packetIntegrity: 'sha512-tampered' }) },
    message: /mqtt-packet 9\.0\.2 \(resolution changed\)/,
  },
  {
    name: 'requires a bump for changed lockfile settings',
    files: { 'pnpm-lock.yaml': lockfile({ top: '\npnpmfileChecksum: sha256-abc\n' }) },
    message: /lockfile pnpmfileChecksum changed/,
  },
  {
    name: 'requires a bump when the lockfile is removed',
    files: { 'pnpm-lock.yaml': null },
    message: /pnpm-lock\.yaml \(added or removed\)/,
  },
  {
    name: 'allows an unrelated root package.json change',
    files: { 'package.json': rootPackage({ other: '^1.1.0', scripts: 'b', pnpm: { overrides: { b: '2', a: '1' } } }) },
    pass: true,
  },
  {
    name: 'requires a bump for a changed mqtt specifier',
    files: { 'package.json': rootPackage({ mqtt: '^5.16.0' }) },
    message: /dependencies\.mqtt \^5\.15\.2 → \^5\.16\.0/,
  },
  ...['devDependencies', 'optionalDependencies'].map((section) => ({
    name: `requires a bump for mqtt moving to ${section}`,
    files: { 'package.json': rootPackage({ section }) },
    message: new RegExp(`${section}\\.mqtt \\(none\\) → \\^5\\.15\\.2`),
  })),
  {
    name: 'requires a bump for changed pnpm overrides',
    files: { 'package.json': rootPackage({ pnpm: { overrides: { a: '1', b: '3' } } }) },
    message: /pnpm\.overrides \(b\)/,
  },
  {
    name: 'requires a bump for changed pnpm patched dependencies',
    files: {
      'package.json': rootPackage({ pnpm: { patchedDependencies: { 'mqtt-packet@9.0.2': 'patches/x.patch' } } }),
    },
    message: /pnpm\.patchedDependencies \(mqtt-packet@9\.0\.2\)/,
  },
  {
    name: 'requires a bump for changed pnpm package extensions',
    files: { 'package.json': rootPackage({ pnpm: { packageExtensions: { 'mqtt@*': { dependencies: { x: '1' } } } } }) },
    message: /pnpm\.packageExtensions \(mqtt@\*\)/,
  },
  {
    name: 'requires a bump for a changed packageManager',
    files: { 'package.json': rootPackage({ manager: 'pnpm@10.1.0+sha512.def' }) },
    message: /packageManager pnpm@10\.0\.0 → pnpm@10\.1\.0/,
  },
  {
    name: 'treats an unparseable lockfile as runtime source',
    files: { 'pnpm-lock.yaml': 'not: [a lockfile' },
    message: /could not be analysed/,
  },
  {
    name: 'treats an unknown lockfile version as runtime source',
    files: { 'pnpm-lock.yaml': lockfile({ version: '10.0' }) },
    message: /lockfileVersion/,
  },
  ...[
    [
      'a missing snapshot',
      'mqtt-packet: 9.0.2',
      'mqtt-packet: 9.0.3',
      /no snapshot for mqtt-packet@9\.0\.3 \(at HEAD\)/,
    ],
    [
      'a missing packages entry',
      'mqtt-packet@9.0.2:\n    resolution',
      'mqtt-packet@9.0.9:\n    resolution',
      /no packages entry/,
    ],
    ['a missing snapshots section', /\nsnapshots:[^]*$/, '\n', /no snapshots section/],
    ['a missing root importer', '\n  .:\n', "\n  'apps/root':\n", /root importer not found/],
    ['a line it cannot read', '  other@1.0.0: {}', '  other@1.0.0', /unexpected lockfile line/],
    ['a duplicate entry', '  other@1.0.0: {}', '  other@1.0.0: {}\n  other@1.0.0: {}', /duplicate lockfile entry/],
    [
      'unexpected indentation',
      '      mqtt-packet: 9.0.2',
      '          mqtt-packet: 9.0.3\n      mqtt-packet: 9.0.2',
      /unexpected indentation/,
    ],
    [
      'a multi-line string',
      '    optionalDependencies:',
      '    x: "\n    optionalDependencies:',
      /unsupported quoted value/,
    ],
    [
      'a flow-style importer entry',
      '      mqtt:\n        specifier: ^5.15.2\n        version: 5.16.0',
      '      mqtt: {specifier: ^5.15.2, version: 5.16.1}',
      /unsupported value/,
    ],
    [
      'a missing runtime dependency',
      '      mqtt:\n        specifier: ^5.15.2\n        version: 5.16.0\n',
      '',
      /mqtt is not a dependency/,
    ],
  ].map(([what, from, to, message]) => ({
    name: `treats a lockfile with ${what} as runtime source`,
    files: { 'pnpm-lock.yaml': malformed(from, to) },
    message,
  })),
  {
    name: 'treats an unparseable package.json as runtime source',
    files: { 'package.json': '{ nope' },
    message: /package\.json \(could not be analysed/,
  },
  {
    name: 'follows the dependencies declared by the runtime package',
    baseline: { [runtimePackage]: JSON.stringify({ dependencies: { mqtt: '^5.15.2', other: '^1.0.0' } }) },
    files: { 'pnpm-lock.yaml': lockfile({ other: '1.0.1' }) },
    message: /other 1\.0\.0 → 1\.0\.1/,
  },
  {
    name: 'detects a runtime dependency change when run from a subdirectory',
    files: { 'pnpm-lock.yaml': lockfile({ mqtt: '5.16.1' }) },
    message: /mqtt 5\.16\.0 → 5\.16\.1/,
    cwd: 'apps',
  },
  {
    name: 'allows an unrelated change to a lockfile larger than 1 MiB',
    baseline: { 'pnpm-lock.yaml': bigLockfile() },
    files: { 'pnpm-lock.yaml': bigLockfile({ other: '1.0.1' }) },
    pass: true,
  },
  {
    name: 'requires a bump for a changed mqtt version in a lockfile larger than 1 MiB',
    baseline: { 'pnpm-lock.yaml': bigLockfile() },
    files: { 'pnpm-lock.yaml': bigLockfile({ mqtt: '5.16.1' }) },
    message: /mqtt 5\.16\.0 → 5\.16\.1/,
  },
]) {
  test(name, () => {
    const directory = mkdtempSync(join(tmpdir(), 'cc100-version-check-'));
    const env = fixtureGitEnv();
    const git = (...args) => execFileSync('git', args, { cwd: directory, env, encoding: 'utf8' }).trim();
    const file = (path, content) => {
      if (content === null) return rmSync(join(directory, path));
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
      git('add', '-A');
      git('commit', '--quiet', '-m', 'change');
      const run = () =>
        execFileSync(process.execPath, [script, base], {
          cwd: join(directory, cwd ?? ''),
          env,
          encoding: 'utf8',
          stdio: 'pipe',
        });
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

test('reads the real root lockfile: the runtime closure covers mqtt and ipaddr.js without type-only packages', () => {
  const read = (path) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');
  const declared = new Set(Object.keys(JSON.parse(read(runtimePackage)).dependencies));
  const { roots, packages } = runtimeClosure(parseLockfile(read('pnpm-lock.yaml')), declared);
  assert.deepEqual([...roots.keys()].sort(), [...declared].sort());
  for (const name of declared)
    assert.ok(
      [...packages.keys()].some((key) => key.startsWith(`${name}@`)),
      name,
    );
  assert.ok(![...packages.keys()].some((key) => key.startsWith('@types/')));
});
