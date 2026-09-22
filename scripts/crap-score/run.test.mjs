import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { getCrapReport } from 'crap-score';
import { completeCoverage, isSource, summarizeScores, ownedFiles, nodeCoverage, run } from './run.mjs';

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

test('duplicate source locations collapse without losing same-line anonymous functions', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'crap-duplicates-'));
  try {
    const file = path.join(dir, 'callbacks.ts');
    writeFileSync(file, 'const callbacks = [() => 1, () => 2];\n');
    const measured = completeCoverage([file], [])[file];
    const [first, second] = Object.keys(measured.fnMap);
    measured.fnMap.extra = structuredClone(measured.fnMap[first]);
    measured.f[first] = 2;
    measured.f.extra = 3;
    measured.f[second] = 1;
    const completed = completeCoverage([file], [{ [file]: measured }])[file];
    assert.equal(Object.keys(completed.fnMap).length, 2);
    assert.deepEqual(Object.values(completed.f).sort(), [1, 3]);
    const report = await getCrapReport({ testCoverage: { [file]: completed } });
    assert.equal(Object.values(report).flatMap(Object.values).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

test('partial coverage retains omitted functions in an otherwise covered file', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'crap-partial-'));
  try {
    const file = path.join(dir, 'source.js');
    writeFileSync(file, 'export function called() { return 1; }\nexport function missed() { return 2; }');
    const measured = completeCoverage([file], []);
    delete measured[file].fnMap['1'];
    delete measured[file].f['1'];
    measured[file].f['0'] = 1;
    const completed = completeCoverage([file], [measured])[file];
    assert.equal(Object.keys(completed.fnMap).length, 2);
    assert.deepEqual(Object.values(completed.f).sort(), [0, 1]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Node coverage includes spawned source copies without counting fixture code', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'crap-node-'));
  try {
    const file = path.join(dir, 'source.mjs');
    const copy = path.join(dir, 'copy.mjs');
    const suite = path.join(dir, 'suite.test.mjs');
    const source = 'export function choose(x) { return x ? 1 : 0; }\nchoose(true);';
    writeFileSync(file, source);
    writeFileSync(copy, source);
    writeFileSync(
      suite,
      `import { test } from 'node:test';\nimport { execFileSync } from 'node:child_process';\ntest('child', () => execFileSync(process.execPath, [${JSON.stringify(copy)}]));`,
    );
    const reports = nodeCoverage([file], [suite], path.join(dir, 'coverage'));
    const completed = completeCoverage([file], reports)[file];
    assert.ok(Object.values(completed.f).some((count) => count > 0));
    assert.ok(reports.every((report) => Object.keys(report).every((name) => name === file)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('normalizes transformed bodies by exact declaration before filling missing functions', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'crap-declaration-'));
  try {
    const file = path.join(dir, 'source.js');
    writeFileSync(file, 'const a = () => 1; const b = () => 2;');
    const measured = completeCoverage([file], []);
    measured[file].fnMap['0'].loc.start.column -= 1;
    measured[file].f['0'] = 2;
    const completed = completeCoverage([file], [measured])[file];
    assert.equal(Object.keys(completed.fnMap).length, 2);
    assert.deepEqual(Object.values(completed.f).sort(), [0, 2]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unresolvable source mappings fail visibly instead of dropping functions', async () => {
  const { repairFunctionLocations } = await import('./run.mjs');
  const fn = {
    name: 'unmapped',
    decl: { start: { line: 99, column: 0 }, end: { line: 99, column: 1 } },
    loc: { start: { line: 99, column: 0 }, end: { line: 100, column: null } },
  };
  assert.throws(() => repairFunctionLocations({ 0: fn }, {}), /Ambiguous source mapping/);
});

test('WAGO includes both frontend configurations and host-composed acceptance suites', async () => {
  const { suites } = await import('./run.mjs');
  const configs = suites('apps/plugins/wago').map((suite) => suite.args[1]);
  assert.deepEqual(configs, [
    'apps/plugins/wago/jest.config.ts',
    'apps/plugins/wago/frontend/vitest.config.mts',
    'apps/plugins/wago/frontend/vitest.config.ts',
    'apps/plugins/wago/scripts/jest.audit-hooks.config.cjs',
    'apps/plugins/wago/scripts/jest.commissioning.config.cjs',
  ]);
});

test('compiler export getters do not create functions in a function-free barrel', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'crap-barrel-'));
  try {
    const file = path.join(dir, 'index.ts');
    writeFileSync(file, "export { value } from './value';\n");
    const measured = completeCoverage([file], [])[file];
    measured.fnMap.getter = {
      name: '(anonymous_0)',
      decl: { start: { line: 1, column: 9 }, end: { line: 1, column: 14 } },
      loc: { start: { line: 1, column: 9 }, end: { line: 1, column: null } },
    };
    measured.f.getter = 1;
    const result = completeCoverage([file], [{ [file]: measured }])[file];
    assert.deepEqual(result.fnMap, {});
    assert.deepEqual(result.f, {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('exported named functions retain coverage when transforms map to the function keyword', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'crap-export-'));
  try {
    const file = path.join(dir, 'source.ts');
    writeFileSync(file, 'export function Component() {\n  return [1].map(() => 2);\n}\n');
    const measured = completeCoverage([file], [])[file];
    const [id, fn] = Object.entries(measured.fnMap)[0];
    fn.name = 'Component';
    fn.decl.start.column = 7;
    fn.loc = { start: { line: 1, column: 7 }, end: { line: 2, column: null } };
    measured.f[id] = 3;
    const result = completeCoverage([file], [{ [file]: measured }])[file];
    assert.equal(Object.keys(result.fnMap).length, 2);
    assert.equal(result.f[id], 3);
    assert.equal(result.fnMap[id].loc.end.line, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('enum compiler wrappers are excluded while enum initializer callbacks remain', async () => {
  const { removeEnumWrappers } = await import('./run.mjs');
  const coverage = {
    fnMap: {
      wrapper: { loc: { start: { line: 1, column: 7 }, end: { line: 1, column: null } } },
      callback: { loc: { start: { line: 1, column: 31 }, end: { line: 1, column: 38 } } },
    },
    f: { wrapper: 1, callback: 2 },
  };
  removeEnumWrappers(coverage, 'enum.ts', 'export enum Value { One = (() => 1)() }');
  assert.deepEqual(Object.keys(coverage.fnMap), ['callback']);
  assert.deepEqual(coverage.f, { callback: 2 });
});

test('an enum inside a compact function does not discard its measured coverage', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'crap-enclosing-enum-'));
  try {
    const file = path.join(dir, 'source.ts');
    writeFileSync(file, 'export function pick() { enum Value { One }; return Value.One; }');
    const measured = completeCoverage([file], [])[file];
    for (const id of Object.keys(measured.f)) measured.f[id] = 4;
    for (const id of Object.keys(measured.s)) measured.s[id] = 4;
    const result = completeCoverage([file], [{ [file]: measured }])[file];
    assert.deepEqual(Object.values(result.f), [4]);
    assert.ok(Object.values(result.s).every((count) => count === 4));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('filling a missing outer function preserves measured nested statements', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'crap-nested-statements-'));
  try {
    const file = path.join(dir, 'source.ts');
    writeFileSync(file, 'export function outer() { return () => 1; }');
    const measured = completeCoverage([file], [])[file];
    for (const id of Object.keys(measured.s)) measured.s[id] = 1;
    const [outer] = Object.keys(measured.fnMap);
    delete measured.fnMap[outer];
    delete measured.f[outer];
    const result = completeCoverage([file], [{ [file]: measured }])[file];
    assert.deepEqual(result.statementMap, measured.statementMap);
    assert.deepEqual(result.s, measured.s);
    assert.equal(Object.keys(result.fnMap).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('null-ended nested statements retain their measured count when filling outer functions', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'crap-null-statements-'));
  try {
    const file = path.join(dir, 'source.ts');
    writeFileSync(file, 'export function outer() {\n return () => 1;\n}\n');
    const measured = completeCoverage([file], [])[file];
    for (const id of Object.keys(measured.s)) measured.s[id] = 1;
    const originalStatements = structuredClone(measured.statementMap);
    const [outer] = Object.keys(measured.fnMap);
    delete measured.fnMap[outer];
    delete measured.f[outer];
    for (const statement of Object.values(measured.statementMap)) statement.end.column = null;
    const result = completeCoverage([file], [{ [file]: measured }])[file];
    assert.deepEqual(result.statementMap, originalStatements);
    assert.ok(Object.values(result.s).every((count) => count === 1));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('repaired statement ranges merge covered and uncovered copies from different runners', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'crap-multi-runner-'));
  try {
    const file = path.join(dir, 'source.ts');
    writeFileSync(file, 'export function choose(flag: boolean) { if (flag) return 1; return 2; }\n');
    const measured = completeCoverage([file], [])[file];
    for (const id of Object.keys(measured.s)) measured.s[id] = 1;
    for (const id of Object.keys(measured.f)) measured.f[id] = 1;
    const unexecuted = JSON.parse(JSON.stringify(measured));
    for (const [id, statement] of Object.entries(unexecuted.statementMap)) {
      unexecuted.s[id] = 0;
      statement.end.column = null;
    }
    for (const id of Object.keys(unexecuted.f)) unexecuted.f[id] = 0;
    for (const reports of [
      [{ [file]: measured }, { [file]: unexecuted }],
      [{ [file]: unexecuted }, { [file]: measured }],
    ]) {
      const completed = completeCoverage([file], reports);
      assert.equal(Object.keys(completed[file].statementMap).length, Object.keys(measured.statementMap).length);
      assert.ok(Object.values(completed[file].s).every((count) => count > 0));
      const report = await getCrapReport({ testCoverage: completed });
      assert.equal(Object.values(report).flatMap(Object.values)[0].statements.crap, 2);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runs an Nx library suite and writes consistent JSON, HTML, and summary artifacts', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'attraccess-crap-integration-'));
  try {
    await run('libs/env', directory);
    const summary = JSON.parse(readFileSync(path.join(directory, 'summary.json'), 'utf8'));
    const report = JSON.parse(readFileSync(path.join(directory, 'crap-report.json'), 'utf8'));
    const functions = Object.values(report).flatMap((file) => Object.values(file));
    assert.equal(summary.project, 'env');
    assert.ok(summary.files > 0);
    assert.ok(summary.functions > 0);
    assert.deepEqual(summarizeScores(functions), {
      functions: summary.functions,
      atLeast30: summary.atLeast30,
      max: summary.max,
    });
    assert.ok(existsSync(path.join(directory, 'html/index.html')));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
