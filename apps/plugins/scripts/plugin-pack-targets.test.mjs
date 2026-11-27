import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const pluginsRoot = join(import.meta.dirname, '..');

// `pack` reads `package/`, which is gitignored, so Nx leaves it out of the cache key: a cached run restores whatever
// tarball was packed first, and CI would load and verify an old build.
test('no official plugin caches its pack or pack-test target', () => {
  const projects = readdirSync(pluginsRoot)
    .filter((name) => existsSync(join(pluginsRoot, name, 'project.json')))
    .map((name) => [name, JSON.parse(readFileSync(join(pluginsRoot, name, 'project.json'), 'utf8'))])
    .filter(([, project]) => project.tags?.includes('type:plugin'));
  assert.ok(projects.length > 0);
  for (const [name, project] of projects)
    for (const target of ['pack', 'pack-test'])
      assert.equal(project.targets[target]?.cache, false, `${name}:${target} must set "cache": false`);
});
