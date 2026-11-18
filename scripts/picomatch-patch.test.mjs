import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// GHSA-fc5q-39xc-vjpf has no picomatch release yet; patches/picomatch@*.patch backport the upstream fix
// (micromatch/picomatch#237 for v4, #246 for v2). Every installed copy must carry it.
const store = fileURLToPath(new URL('../node_modules/.pnpm/', import.meta.url));
const lockfile = readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8');
const versions = [...new Set([...lockfile.matchAll(/^ {2}picomatch@(\d[^:(]*):$/gm)].map((match) => match[1]))];
const require = createRequire(import.meta.url);

test('every locked picomatch version is installed patched', () => {
  assert.ok(versions.length > 0);
  for (const version of versions) {
    assert.ok(patchedCopy(version), `picomatch@${version} has no patched copy; add it to patchedDependencies`);
  }
});

for (const version of versions) {
  const copy = patchedCopy(version);
  if (!copy) continue;
  const picomatch = require(join(store, copy, 'node_modules/picomatch'));

  test(`picomatch@${version} matches single-branch repeated extglobs without backtracking`, () => {
    // Unpatched, 28 characters already take seconds here.
    const crafted = `${'a'.repeat(50)}b`;
    for (const pattern of ['+(*a)', '*(*a)', '+(*a)c']) {
      const start = performance.now();
      assert.equal(picomatch.isMatch(crafted, pattern), false);
      assert.ok(performance.now() - start < 100, `${pattern} took too long`);
    }
  });

  test(`picomatch@${version} keeps matching single-branch repeated extglobs`, () => {
    assert.equal(picomatch.isMatch('abc', '+(*)c'), true);
    assert.equal(picomatch.isMatch('a.a', '+(*a)'), true);
    assert.equal(picomatch.isMatch('ab', '+(*a)'), false);
    assert.equal(picomatch.isMatch('foo.js', '*(*.js)'), true);
    assert.equal(picomatch.isMatch('foo.ts', '*(*.js)'), false);
  });
}

function patchedCopy(version) {
  return readdirSync(store).find((entry) => entry.startsWith(`picomatch@${version}_patch_hash=`));
}
