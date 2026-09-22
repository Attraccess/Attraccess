import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { getCrapReport } from 'crap-score';
import { completeCoverage, isSource } from './run.mjs';

test('source selection includes apps and scripts but excludes tests and generated clients', () => {
  for (const file of ['apps/companion/renderer/App.tsx', 'apps/api/src/main.ts', 'scripts/dev-serve.mts'])
    assert.ok(isSource(file), file);
  for (const file of [
    'apps/api/src/main.spec.ts',
    'apps/frontend/src/test-utils/setup.ts',
    'libs/api-client/src/generated/client.ts',
    'libs/react-query-client/src/lib/client.ts',
    'apps/api/src/types.d.ts',
    'apps/plugins/wago/frontend/vitest.config.mts',
  ])
    assert.ok(!isSource(file), file);
});

test('uncovered functions are scored and coverage preserves repeated function names', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'crap-integration-'));
  try {
    const file = path.join(dir, 'source.ts');
    writeFileSync(
      file,
      'class A { run(x: boolean) { if (x) return 1; return 0; } }\nclass B { run(x: boolean) { if (x) return 2; return 0; } }\n',
    );
    const uncovered = completeCoverage([file], []);
    const report = await getCrapReport({ testCoverage: uncovered });
    const functions = Object.values(report).flatMap(Object.values);
    assert.equal(functions.length, 2);
    assert.ok(functions.every((fn) => fn.statements.crap === 6));
    const measured = JSON.parse(JSON.stringify(uncovered));
    for (const id of Object.keys(measured[file].s)) measured[file].s[id] = 1;
    for (const id of Object.keys(measured[file].f)) measured[file].f[id] = 1;
    const covered = completeCoverage([file], [measured]);
    const coveredReport = await getCrapReport({ testCoverage: covered });
    assert.ok(
      Object.values(coveredReport)
        .flatMap(Object.values)
        .every((fn) => fn.statements.crap === 2),
    );
    assert.deepEqual(Object.keys(completeCoverage([file], [measured, { '/outside.ts': measured[file] }])), [file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

test('repairs missing mapped columns without losing nested callbacks or execution counts', async () => {
  const { repairFunctionLocations } = await import('./run.mjs');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'crap-sourcemap-'));
  try {
    const file = path.join(dir, 'callbacks.ts');
    writeFileSync(
      file,
      'export const evaluate = (values: number[]) =>\n  values.filter(value => value > 0).map(value => value + 1);\n',
    );
    const original = completeCoverage([file], [])[file];
    const mapped = JSON.parse(JSON.stringify(original));
    mapped.fnMap['0'].loc.start = { line: 1, column: 24 };
    for (const fn of Object.values(mapped.fnMap)) fn.loc.end.column = null;
    mapped.f['0'] = 3;
    repairFunctionLocations(mapped.fnMap, original.fnMap);
    assert.deepEqual(mapped.fnMap, original.fnMap);
    assert.equal(mapped.f['0'], 3);
    const report = await getCrapReport({ testCoverage: { [file]: mapped } });
    assert.equal(Object.values(report).flatMap(Object.values).length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
