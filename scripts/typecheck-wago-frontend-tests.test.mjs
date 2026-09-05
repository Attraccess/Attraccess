import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const baseline = [
  'apps/plugins/wago/frontend/src/CommissioningModal.test.tsx(108,88): error TS2769: No overload matches this call.',
  'apps/plugins/wago/frontend/src/CommissioningModal.test.tsx(179,65): error TS2769: No overload matches this call.',
].map((line) => `${line}\n  The last overload gave the following error.\n` +
  "    Object literal may only specify known properties, and 'exact' does not exist in type 'ByRoleOptions'.\n").join('');
const warning = 'WARN Issue while reading fixture .npmrc. Failed to replace env in config: ${NODE_AUTH_TOKEN}\n';

// Exercise the real wrapper against a local compiler fixture, with no package
// manager, repository config, credentials, or network involved.
async function runCompilerFixture({ stdout = baseline, stderr = '', status = 1 } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'wago-typecheck-test-'));
  try {
    const script = join(directory, 'typecheck.mjs');
    await copyFile(new URL('./typecheck-wago-frontend-tests.mjs', import.meta.url), script);
    const compilerDirectory = join(directory, 'node_modules/typescript/bin');
    await mkdir(compilerDirectory, { recursive: true });
    await writeFile(join(compilerDirectory, '../package.json'), JSON.stringify({
      bin: { tsc: './bin/tsc' },
      exports: { './package.json': './package.json' },
    }));
    await writeFile(join(compilerDirectory, 'tsc'), `
      require('node:assert/strict').deepEqual(process.argv.slice(2), [
        '--noEmit', '--pretty', 'false', '-p', 'apps/plugins/wago/frontend/tsconfig.tests.json',
      ]);
      process.stdout.write(process.env.FIXTURE_STDOUT);
      process.stderr.write(process.env.FIXTURE_STDERR);
      process.exitCode = Number(process.env.FIXTURE_STATUS);
    `);
    // A package-manager invocation would contaminate otherwise valid output.
    await writeFile(join(directory, 'pnpm'), `#!${process.execPath}\n` +
      `process.stdout.write(process.env.FIXTURE_STDOUT);\n` +
      `process.stderr.write(${JSON.stringify(warning)});\nprocess.exitCode = 1;\n`, { mode: 0o700 });
    const config = join(directory, '.npmrc');
    await writeFile(config, '//fixture.invalid/:_authToken=${NODE_AUTH_TOKEN}\n');
    return spawnSync(process.execPath, [script], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        PATH: directory,
        NPM_CONFIG_USERCONFIG: config,
        FIXTURE_STDOUT: stdout,
        FIXTURE_STDERR: stderr,
        FIXTURE_STATUS: String(status),
      },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('accepts exactly the two baseline errors without invoking the warning-producing package manager', async () => {
  const result = await runCompilerFixture();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, 'Raw frontend test tsc exit: 1; commissioning baseline accepted 2 known diagnostics and no others.\n' + baseline);
});

test('rejects a new TypeScript diagnostic alongside the baseline', async () => {
  const stdout = baseline + 'frontend/new.ts(1,1): error TS2322: Type mismatch.\n';
  const result = await runCompilerFixture({ stdout });
  assert.equal(result.status, 1);
  assert.equal(result.stderr, stdout);
});

test('rejects a changed commissioning diagnostic', async () => {
  const stdout = baseline.replace('(108,88)', '(109,88)');
  const result = await runCompilerFixture({ stdout });
  assert.equal(result.status, 1);
  assert.equal(result.stderr, stdout);
});

test('does not whitelist package-manager warnings if they appear in compiler output', async () => {
  const result = await runCompilerFixture({ stderr: warning });
  assert.equal(result.status, 1);
  assert.equal(result.stderr, baseline + warning);
});

test('accepts a successful compiler with no diagnostics', async () => {
  const result = await runCompilerFixture({ stdout: '', status: 0 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Raw frontend test tsc exit: 0; commissioning baseline accepted 0 known diagnostics/);
});

test('rejects compiler failure without diagnostics', async () => {
  const result = await runCompilerFixture({ stdout: '', status: 2 });
  assert.equal(result.status, 2);
});
