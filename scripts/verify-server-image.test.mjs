import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  devOnlyPackages,
  installedDevOnlyPackages,
  missingCommands,
  requiredPackages,
  transitiveOnlyPackages,
  unresolvablePackages,
} from './verify-server-image.mjs';

let directory;
beforeEach(() => (directory = mkdtempSync(join(tmpdir(), 'verify-server-image-'))));
afterEach(() => rmSync(directory, { recursive: true, force: true }));

function write(file, content = '') {
  mkdirSync(join(directory, file, '..'), { recursive: true });
  writeFileSync(join(directory, file), content);
  return join(directory, file);
}

test('reads package requires and skips built-ins, local paths, comments and bundled libraries', () => {
  const source = [
    'module.exports = require("@scope/pkg/sub.js");',
    "const a = require('plain');",
    'module.exports = require("node:fs");',
    'module.exports = require("path");',
    'require("./local"); require("/absolute");',
    "// A plugin does require('only-in-a-comment')",
    " * require('only-in-a-block-comment')",
    "require('@attraccess/plugins-backend-sdk')",
    'this.require("method-call"); require(permission, `x`);',
  ].join('\n');
  assert.deepEqual(requiredPackages(source), ['@scope/pkg/sub.js', 'plain']);
});

test('reports a required package that is not installed next to the bundle', () => {
  write('node_modules/present/index.js');
  const entry = write('main.js', 'require("present"); require("absent-package-for-test");');
  assert.deepEqual(unresolvablePackages(entry), ['absent-package-for-test']);
});

// A changed bundle format would otherwise leave an empty list, which resolves trivially.
test('fails when the bundle yields no package requires to check', () => {
  const entry = write('main.js', 'import("present"); require("./local"); require("node:fs");');
  assert.throws(() => unresolvablePackages(entry), /No package requires found/);
});

test('finds development-only packages as direct and as transitive dependencies', () => {
  write('node_modules/glob/package.json');
  write('node_modules/.pnpm/@nestjs+testing@12.0.0_peer/package.json');
  write('node_modules/.pnpm/glob-parent@6.0.2/package.json');
  write('node_modules/.pnpm/@nestjs+swagger@12.0.0/package.json');
  write('node_modules/.pnpm/glob@14.0.0/package.json');
  assert.deepEqual(installedDevOnlyPackages(join(directory, 'node_modules')), ['@nestjs/testing', 'glob']);
});

test('allows glob only as a dependency of a runtime package', () => {
  write('node_modules/.pnpm/glob@14.0.0/package.json');
  assert.deepEqual(installedDevOnlyPackages(join(directory, 'node_modules')), []);
});

test('requires commands to be executable on the search path', () => {
  chmodSync(write('bin/tool'), 0o755);
  chmodSync(write('bin/plain-file'), 0o644);
  assert.deepEqual(missingCommands(['tool', 'plain-file', 'nowhere'], join(directory, 'bin')), [
    'plain-file',
    'nowhere',
  ]);
});

// The image installs what Nx derives from these manifests. Nx drops root devDependencies from it, but adds a
// root dependency as soon as any workspace file imports it, tests included.
test('development-only packages stay out of the production manifests', () => {
  const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
  const root = read('package.json').dependencies;
  const api = read('apps/api/package.json').dependencies;
  assert.deepEqual(
    [...devOnlyPackages, ...transitiveOnlyPackages].filter((name) => name in root || name in api),
    [],
  );
});

// This machine has no /app/dist/apps/api, so a check that really runs has to fail.
test('runs the checks when started through a symlink', () => {
  const link = join(directory, 'verify.mjs');
  symlinkSync(fileURLToPath(new URL('./verify-server-image.mjs', import.meta.url)), link);
  const run = spawnSync(process.execPath, [link], { encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /main\.js/);
});
