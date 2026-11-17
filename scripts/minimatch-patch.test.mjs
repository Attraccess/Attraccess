import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// GHSA-g3hv-75wg-m249 is fixed only in minimatch 11, which dropped makeRe/AST; patches/minimatch@10.2.6.patch backports
// the upstream fix (isaacs/minimatch@77a0f5c). Every locked 7.x-10.x copy must carry it.
const store = fileURLToPath(new URL('../node_modules/.pnpm/', import.meta.url));
const lockfile = readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8');
const versions = [...new Set([...lockfile.matchAll(/^ {2}minimatch@(\d[^:(]*):$/gm)].map((match) => match[1]))].filter(
  (version) => ['7', '8', '9', '10'].includes(version.split('.')[0]),
);
const require = createRequire(import.meta.url);
const optimizationLevel = 2;

test('every locked minimatch 7.x-10.x version is installed patched', () => {
  assert.ok(versions.length > 0);
  for (const version of versions) {
    assert.ok(patchedCopy(version), `minimatch@${version} has no patched copy; add it to patchedDependencies`);
  }
});

for (const version of versions) {
  const copy = patchedCopy(version);
  if (!copy) continue;
  const { Minimatch } = require(join(store, copy, 'node_modules/minimatch'));

  test(`minimatch@${version} stops **/.. splits at braceExpandMax`, () => {
    const pattern = Array(30).fill('**/../a/b').join('/');
    assert.equal(new Minimatch(pattern, { optimizationLevel, braceExpandMax: 64 }).set.length, 64);
  });

  test(`minimatch@${version} still splits and matches below the max`, () => {
    const mm = new Minimatch('**/../a/b/**/../c/d', { optimizationLevel });
    assert.equal(mm.set.length, 4);
    assert.equal(mm.match('../a/b/../c/d'), true);
    assert.equal(mm.match('x/a/b/y/c/d'), true);
    assert.equal(typeof mm.makeRe(), 'object');
  });
}

function patchedCopy(version) {
  return readdirSync(store).find((entry) => entry.startsWith(`minimatch@${version}_patch_hash=`));
}
