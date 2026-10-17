import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { fixtureGitEnv } from './test-utils/git-env.mjs';

const script = fileURLToPath(new URL('./check-attractap-firmware-version.sh', import.meta.url));
const versionFile = 'apps/attractap/firmware/version.txt';
const source = 'apps/attractap/firmware/src/main.cpp';

for (const [name, changedPath, version, passes] of [
  ['rejects an unchanged version', source, '1.3.24', false],
  ['rejects a downgrade', source, '1.3.23', false],
  ['rejects malformed versions', source, '2.whatever', false],
  ['rejects prereleases', source, '2.0.0-dev', false],
  ['rejects deleting the version', source, '', false],
  ['rejects leading zero components', source, '01.4.0', false],
  ['accepts patch increases', source, '1.3.25', true],
  ['accepts minor increases', source, '1.4.0', true],
  ['accepts major increases', source, '2.0.0', true],
  ['compares components numerically', source, '1.10.0', true],
  ['rejects a version-only downgrade', versionFile, '1.2.0', false],
  ['requires bumps for build configuration', 'apps/attractap/firmware/sdkconfig.defaults', '1.3.24', false],
  ['requires bumps for toolchain version changes', 'apps/attractap/firmware/esp-idf-version.txt', '1.3.24', false],
  ['ignores firmware documentation', 'apps/attractap/firmware/docs/guide.md', '1.3.24', true],
  ['ignores colocated firmware tests', 'apps/attractap/firmware/src/main.spec.cpp', '1.3.24', true],
  ['ignores firmware tests', 'apps/attractap/firmware/tests/supervision/main.cpp', '1.3.24', true],
  ['ignores firmware tooling', 'apps/attractap/firmware/tools/setup-esp-idf.sh', '1.3.24', true],
  ['ignores unrelated changes', 'apps/frontend/README.md', '1.3.24', true],
]) {
  test(name, (t) => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'firmware-version-'));
    t.after(() => rmSync(cwd, { recursive: true, force: true }));
    const env = fixtureGitEnv();
    const git = (...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();
    const write = (file, contents) => {
      mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
      writeFileSync(path.join(cwd, file), contents);
    };
    git('init', '--quiet');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.com');
    git('config', 'commit.gpgsign', 'false');
    write(versionFile, '1.3.24\n');
    write(source, 'baseline');
    git('add', '.');
    git('commit', '--quiet', '-m', 'baseline');
    const base = git('rev-parse', 'HEAD');
    write(changedPath, 'changed');
    write(versionFile, `${version}\n`);
    git('add', '.');
    git('commit', '--quiet', '-m', 'change');
    const result = spawnSync('sh', [script, base], { cwd, env, encoding: 'utf8' });
    assert.ifError(result.error);
    assert.equal(result.status, passes ? 0 : 1, result.stdout + result.stderr);
    if (passes) assert.match(result.stdout, /increased|No Attractap/);
    else assert.match(result.stderr, /increasing|stable major.minor.patch/);
  });
}
