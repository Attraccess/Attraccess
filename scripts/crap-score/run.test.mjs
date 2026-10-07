import assert from 'node:assert/strict';
import { test } from 'node:test';
// Run source-mapping checks before the integration runner installs its global logger.
import './coverage-normalization.test.mjs';
import './coverage-integration.test.mjs';
import { isSource, ownedFiles, summarizeScores } from './run.mjs';

test('source selection includes apps and scripts but excludes tests and generated clients', () => {
  for (const file of [
    'apps/companion/renderer/App.tsx',
    'apps/api/src/main.ts',
    'scripts/dev-serve.mts',
    'apps/plugins/wago/frontend/vitest.config.mts',
  ])
    assert.ok(isSource(file), file);
  for (const file of [
    'apps/api/src/main.spec.ts',
    'apps/frontend/src/test-utils/setup.ts',
    'libs/api-client/src/generated/client.ts',
    'libs/react-query-client/src/lib/client.ts',
    'apps/api/src/types.d.ts',
    'apps/frontend/public/openscad/openscad.wasm.js',
  ])
    assert.ok(!isSource(file), file);
});

test('only the vendored OpenSCAD runtime is excluded, not maintained public scripts', () => {
  assert.ok(isSource('apps/frontend/public/worker.js'));
  assert.ok(isSource('apps/frontend/public/openscad/adapter.js'));
});

test('the strict target counts scores exactly equal to 30', () => {
  assert.deepEqual(summarizeScores([29.99, 30, 30.01].map((crap) => ({ statements: { crap } }))), {
    functions: 3,
    atLeast30: 2,
    max: 30.01,
  });
  assert.deepEqual(summarizeScores([]), { functions: 0, atLeast30: 0, max: 0 });
});
test('every JS/TS Nx project has a report target with an isolated output path', async () => {
  const { execFileSync } = await import('node:child_process');
  const { readFileSync } = await import('node:fs');
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0');
  const nativeProjects = new Set(['apps/attractap/firmware/project.json', 'apps/attractap/desktop/project.json']);
  const outputs = new Set();
  for (const file of files.filter((file) => /(^|\/)project\.json$/.test(file))) {
    const project = JSON.parse(readFileSync(file, 'utf8'));
    if (nativeProjects.has(file)) continue;
    assert.ok(project.targets?.['crap-score'], `${file} needs a crap-score target`);
    const output = project.name.replaceAll('/', '__');
    assert.ok(!outputs.has(output), `Duplicate report output: ${output}`);
    outputs.add(output);
  }
});
test('ownership retains standalone tools and assigns nested sources exactly once', () => {
  const files = [
    'project.json',
    'apps/a/project.json',
    'apps/a/nested/project.json',
    'tools/standalone.js',
    'root.config.js',
    'apps/a/main.ts',
    'apps/a/nested/main.ts',
  ];
  assert.deepEqual(ownedFiles('.', files).filter(isSource), ['tools/standalone.js', 'root.config.js']);
  assert.deepEqual(ownedFiles('apps/a', files).filter(isSource), ['apps/a/main.ts']);
  assert.deepEqual(ownedFiles('apps/a/nested', files).filter(isSource), ['apps/a/nested/main.ts']);
});
test('WAGO includes the complete serial frontend suite once and host-composed acceptance suites', async () => {
  const { suites } = await import('./run.mjs');
  const configs = suites('apps/plugins/wago').map((suite) => suite.args[1]);
  assert.deepEqual(configs, [
    'apps/plugins/wago/jest.config.ts',
    'apps/plugins/wago/frontend/vitest.config.mts',
    'apps/plugins/wago/scripts/jest.audit-hooks.config.cjs',
    'apps/plugins/wago/scripts/jest.commissioning.config.cjs',
  ]);
});
