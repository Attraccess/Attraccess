import { getCrapReport } from 'crap-score';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { completeCoverage } from './run.mjs';

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

test('re-export getters are excluded without dropping adjacent first-party functions', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'crap-reexport-'));
  try {
    const file = path.join(directory, 'source.ts');
    writeFileSync(file, 'export { external } from "./external"; export const local = () => 1;');
    const measured = completeCoverage([file], [])[file];
    const id = Object.keys(measured.fnMap)[0];
    measured.f[id] = 7;
    measured.fnMap[id].loc.end.column = null;
    measured.fnMap.getter = {
      name: '(anonymous_getter)',
      decl: { start: { line: 1, column: 9 }, end: { line: 1, column: 17 } },
      loc: { start: { line: 1, column: 9 }, end: { line: 1, column: 17 } },
    };
    measured.f.getter = 1;
    const completed = completeCoverage([file], [{ [file]: measured }])[file];
    assert.equal(Object.keys(completed.fnMap).length, 1);
    assert.deepEqual(Object.values(completed.f), [7]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('nested same-line functions keep their own complexity and source identity', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'crap-nested-identity-'));
  try {
    const file = path.join(directory, 'source.js');
    writeFileSync(
      file,
      [
        'const outer = () => [1].some(x => x ? true : false);',
        'const curry = x => y => x ? y : 0;',
        'const object = () => ({ value: true ? 1 : 0 });',
        'const methods = { run() { return true ? 1 : 0; } };',
      ].join('\n'),
    );
    const report = await getCrapReport({ testCoverage: completeCoverage([file], []) });
    const functions = Object.values(report).flatMap(Object.values);
    assert.equal(functions.length, 6);
    for (const line of [1, 2]) {
      const nested = functions.filter((fn) => fn.start.line === line).sort((a, b) => a.start.column - b.start.column);
      assert.deepEqual(
        nested.map((fn) => fn.complexity),
        [1, 2],
      );
    }
    assert.equal(new Set(functions.map((fn) => JSON.stringify([fn.start, fn.end]))).size, 6);
    assert.deepEqual(
      functions.filter((fn) => fn.start.line > 2).map((fn) => fn.complexity),
      [2, 2],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
