import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { enforceScores, sourceFunctionCount, summarizeScores, workspace } from './run.mjs';
import {
  affectedSelection,
  changedFiles,
  isSharedChange,
  projectSourceManifest,
  selectProjects,
  supportedProjects,
  trackedFiles,
  validateSupportedTargets,
  verifyReports,
} from './affected.mjs';

test('shared checker, root tooling and dependency configuration select every CRAP target', () => {
  for (const file of [
    'scripts/crap-score/run.mjs',
    'scripts/standalone-tool.ts',
    'package.json',
    'apps/plugins/custom/package.json',
    'apps/plugins/custom/tsconfig.test.json',
    'pnpm-lock.yaml',
    'nx.json',
    'jest.preset.js',
    'tsconfig.base.json',
    'apps/frontend/project.json',
    'apps/frontend/vitest.config.ts',
    '.swcrc',
    'vitest.config.mts',
    'apps/plugins/custom/vite.config.mts',
    'libs/demo/.babelrc',
    'pnpm-workspace.yaml',
    'patches/crap-score@1.2.1.patch',
  ])
    assert.ok(isSharedChange([file]), file);
  for (const file of ['apps/attractap/hardware/nfc/src/a.ts', 'apps/companion/renderer/App.tsx', 'libs/shared/src/a.ts', 'tools/config-ui/main.ts'])
    assert.ok(!isSharedChange([file]), file);
  assert.ok(isSharedChange(['patches/crap-score@1.2.1.patch']));
});

test('affected selection uses Nx base or worktree selectors', () => {
  assert.equal(affectedSelection(['--all']), null);
  assert.deepEqual(affectedSelection(['--base=origin/main']), ['--base=origin/main', '--head=HEAD']);
  assert.deepEqual(affectedSelection(['--base=origin/main', '--head=feature']), ['--base=origin/main', '--head=feature']);
  assert.deepEqual(affectedSelection(['--uncommitted']), ['--uncommitted']);
  assert.deepEqual(affectedSelection([]), ['--uncommitted']);
});

test('shared-change detection diffs the same snapshot Nx selects', () => {
  const calls = [];
  const git = (args) => {
    calls.push(args.join(' '));
    return args[0] === 'ls-files' ? 'new.ts\n' : 'nx.json\n';
  };
  assert.deepEqual(changedFiles(null, git), []);
  assert.deepEqual(changedFiles(affectedSelection([]), git), ['nx.json', 'new.ts']);
  assert.deepEqual(calls.splice(0), ['diff --name-only HEAD', 'ls-files --others --exclude-standard']);
  assert.deepEqual(changedFiles(affectedSelection(['--base=origin/main', '--head=feature']), git), ['nx.json']);
  assert.deepEqual(calls.splice(0), ['diff --name-only origin/main...feature']);
  changedFiles(affectedSelection(['--base=origin/main']), git);
  assert.deepEqual(calls, ['diff --name-only origin/main...HEAD']);
});

test('supported projects cannot disappear when a crap-score target is omitted', () => {
  assert.doesNotThrow(() => validateSupportedTargets(['frontend', 'plugin-wago'], ['frontend', 'plugin-wago']));
  assert.throws(
    () => validateSupportedTargets(['frontend', 'new-project'], ['frontend']),
    /Supported JS\/TS projects missing crap-score targets: new-project/,
  );
});

test('support detection reads project roots from the graph without extra Nx processes', () => {
  const nodes = {
    app: { name: 'app', data: { root: 'apps/app' } },
    docs: { name: 'docs', data: { root: 'docs' } },
    tooling: { name: 'tooling', data: { root: '.' } },
  };
  const tracked = ['apps/app/project.json', 'apps/app/src/main.ts', 'docs/project.json', 'docs/readme.md', 'scripts/tool.mjs'];
  assert.deepEqual(supportedProjects(nodes, tracked), ['app', 'tooling']);
});

test('full selection validates the live Nx JS/TS inventory before returning targets', async () => {
  const projects = await selectProjects(['--all']);
  for (const project of ['@attraccess/source', 'attractap-firmware', 'companion', 'plugin-wago'])
    assert.ok(projects.includes(project), project);
});

test('source manifests include only maintained files owned by each configured project', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'crap-source-manifest-'));
  try {
    mkdirSync(path.join(directory, 'libs/demo/src'), { recursive: true });
    mkdirSync(path.join(directory, 'libs/demo/tests'), { recursive: true });
    writeFileSync(path.join(directory, 'libs/demo/project.json'), JSON.stringify({ name: 'demo', root: 'libs/demo' }));
    writeFileSync(path.join(directory, 'libs/demo/src/index.ts'), 'export const value = 1;');
    writeFileSync(path.join(directory, 'libs/demo/tests/index.test.ts'), '');
    const files = ['libs/demo/project.json', 'libs/demo/src/index.ts', 'libs/demo/tests/index.test.ts'];
    assert.deepEqual(projectSourceManifest(['demo'], files, directory).get('demo'), [
      path.join(directory, 'libs/demo/src/index.ts'),
    ]);
    assert.throws(() => projectSourceManifest(['missing'], files, directory), /Missing Nx project configuration/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('report validation omits deleted worktree files exactly like the scorer', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'crap-deleted-source-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const git = (...args) => execFileSync('git', args, { cwd: directory, env, stdio: 'ignore' });
  try {
    mkdirSync(path.join(directory, 'libs/demo/src'), { recursive: true });
    writeFileSync(path.join(directory, 'libs/demo/project.json'), JSON.stringify({ name: 'demo', root: 'libs/demo' }));
    writeFileSync(path.join(directory, 'libs/demo/src/kept.ts'), 'export const kept = 1;\n');
    writeFileSync(path.join(directory, 'libs/demo/src/deleted.ts'), 'export const deleted = 1;\n');
    git('init', '-q');
    git('add', '.');
    rmSync(path.join(directory, 'libs/demo/src/deleted.ts'));
    const tracked = trackedFiles(directory);
    assert.deepEqual(tracked.sort(), ['libs/demo/project.json', 'libs/demo/src/kept.ts']);
    assert.deepEqual(projectSourceManifest(['demo'], tracked, directory).get('demo'), [
      path.join(directory, 'libs/demo/src/kept.ts'),
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('project report validation distinguishes complete zero-function reports from omitted and malformed output', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'crap-report-validation-'));
  const output = path.join(directory, 'coverage/crap/demo');
  const source = path.join(directory, 'demo/empty.ts');
  const coverageEntry = (functions = {}) => ({
    path: source,
    statementMap: {},
    s: {},
    fnMap: functions,
    f: Object.fromEntries(Object.keys(functions).map((key) => [key, 0])),
    branchMap: {},
    b: {},
  });
  try {
    mkdirSync(path.join(output, 'html'), { recursive: true });
    mkdirSync(path.dirname(source), { recursive: true });
    writeFileSync(source, 'export const value = 1;\n');
    writeFileSync(path.join(output, 'html/index.html'), '<html></html>');
    writeFileSync(path.join(output, 'coverage-final.json'), JSON.stringify({ [source]: coverageEntry() }));
    writeFileSync(path.join(output, 'crap-report.json'), JSON.stringify({ [source]: {} }));
    writeFileSync(path.join(output, 'summary.json'), JSON.stringify({ project: 'demo', limit: 30, files: 1, sourceFiles: [source], functions: 0, violations: 0, max: 0 }));
    assert.doesNotThrow(() => verifyReports(['demo'], directory), 'empty-function project is valid');
    writeFileSync(path.join(output, 'crap-report.json'), JSON.stringify({}));
    assert.throws(() => verifyReports(['demo'], directory), /Incomplete analysis report/);
    writeFileSync(path.join(output, 'crap-report.json'), '{');
    assert.throws(() => verifyReports(['demo'], directory), /Malformed CRAP report/);
    writeFileSync(path.join(output, 'crap-report.json'), JSON.stringify({ [source]: {} }));
    writeFileSync(path.join(output, 'coverage-final.json'), JSON.stringify({ [source]: { path: source } }));
    assert.throws(() => verifyReports(['demo'], directory), /Malformed coverage data/);
    rmSync(path.join(output, 'coverage-final.json'));
    assert.throws(() => verifyReports(['demo'], directory), /Missing CRAP report/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('report keys resolve against the scored files\' shared directory when a basename repeats', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'crap-report-keys-'));
  const output = path.join(directory, 'coverage/crap/demo');
  const sources = ['apps/demo/jest.config.ts', 'apps/demo/runtime/jest.config.ts'].map((file) => path.join(directory, file));
  const coverageEntry = (source) => ({ path: source, statementMap: {}, s: {}, fnMap: {}, f: {}, branchMap: {}, b: {} });
  try {
    mkdirSync(path.join(output, 'html'), { recursive: true });
    for (const source of sources) {
      mkdirSync(path.dirname(source), { recursive: true });
      writeFileSync(source, 'export default {};\n');
    }
    writeFileSync(path.join(output, 'html/index.html'), '<html></html>');
    writeFileSync(path.join(output, 'coverage-final.json'), JSON.stringify(Object.fromEntries(sources.map((source) => [source, coverageEntry(source)]))));
    // Upstream strips the shared directory, so the outer config is keyed by its bare basename.
    writeFileSync(path.join(output, 'crap-report.json'), JSON.stringify({ 'jest.config.ts': {}, 'runtime/jest.config.ts': {} }));
    writeFileSync(path.join(output, 'summary.json'), JSON.stringify({ project: 'demo', limit: 30, files: 2, sourceFiles: sources, functions: 0, violations: 0, max: 0 }));
    assert.doesNotThrow(() => verifyReports(['demo'], directory));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('empty analysis is rejected when source contains a function', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'crap-empty-analysis-'));
  const output = path.join(directory, 'coverage/crap/demo');
  const source = path.join(directory, 'demo/source.ts');
  try {
    mkdirSync(path.join(output, 'html'), { recursive: true });
    mkdirSync(path.dirname(source), { recursive: true });
    writeFileSync(source, 'export function work() { return 1; }\n');
    writeFileSync(path.join(output, 'html/index.html'), '<html></html>');
    const coverageEntry = { path: source, statementMap: {}, s: {}, fnMap: {}, f: {}, branchMap: {}, b: {} };
    writeFileSync(path.join(output, 'coverage-final.json'), JSON.stringify({ [source]: coverageEntry }));
    writeFileSync(path.join(output, 'crap-report.json'), JSON.stringify({ [source]: {} }));
    writeFileSync(path.join(output, 'summary.json'), JSON.stringify({ project: 'demo', limit: 30, files: 1, sourceFiles: [source], functions: 0, violations: 0, max: 0 }));
    assert.throws(() => verifyReports(['demo'], directory), /contains 1 source functions but analysis has 0 and coverage has 0/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('function analysis completeness is checked separately for every source file', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'crap-partial-file-analysis-'));
  const output = path.join(directory, 'coverage/crap/demo');
  const populated = path.join(directory, 'demo/populated.ts');
  const omitted = path.join(directory, 'demo/omitted.ts');
  try {
    mkdirSync(path.join(output, 'html'), { recursive: true });
    mkdirSync(path.dirname(populated), { recursive: true });
    writeFileSync(populated, 'export function included() { return 1; }\n');
    writeFileSync(omitted, 'export function omitted() { return 2; }\n');
    writeFileSync(path.join(output, 'html/index.html'), '<html></html>');
    const coverageEntry = (file, fnMap = {}) => ({
      path: file, statementMap: {}, s: {}, fnMap, f: Object.fromEntries(Object.keys(fnMap).map((key) => [key, 0])), branchMap: {}, b: {},
    });
    writeFileSync(path.join(output, 'coverage-final.json'), JSON.stringify({
      [populated]: coverageEntry(populated, { included: { name: 'included', loc: { start: { line: 1 } } } }),
      [omitted]: coverageEntry(omitted),
    }));
    const fn = { functionDescriptor: 'included', start: { line: 1 }, complexity: 1, statements: { crap: 1, coverage: 1 } };
    writeFileSync(path.join(output, 'crap-report.json'), JSON.stringify({ [populated]: { included: fn }, [omitted]: {} }));
    writeFileSync(path.join(output, 'summary.json'), JSON.stringify({
      project: 'demo', limit: 30, files: 2, sourceFiles: [populated, omitted], functions: 1, violations: 0, max: 1,
    }));
    assert.throws(() => verifyReports(['demo'], directory), /omitted\.ts contains 1 source functions but analysis has 0 and coverage has 0/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('per-file function counts must agree even when project totals agree', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'crap-mismatched-file-analysis-'));
  const output = path.join(directory, 'coverage/crap/demo');
  const first = path.join(directory, 'demo/first.ts');
  const second = path.join(directory, 'demo/second.ts');
  try {
    mkdirSync(path.join(output, 'html'), { recursive: true });
    mkdirSync(path.dirname(first), { recursive: true });
    writeFileSync(first, 'export function first() { return 1; }\n');
    writeFileSync(second, 'export function second() { return 2; }\n');
    writeFileSync(path.join(output, 'html/index.html'), '<html></html>');
    const coverageEntry = (file, fnMap = {}) => ({
      path: file, statementMap: {}, s: {}, fnMap, f: Object.fromEntries(Object.keys(fnMap).map((key) => [key, 0])), branchMap: {}, b: {},
    });
    writeFileSync(path.join(output, 'coverage-final.json'), JSON.stringify({
      [first]: coverageEntry(first, { first: { name: 'first', loc: { start: { line: 1 } } } }),
      [second]: coverageEntry(second),
    }));
    const fn = (name) => ({ functionDescriptor: name, start: { line: 1 }, complexity: 1, statements: { crap: 1, coverage: 1 } });
    writeFileSync(path.join(output, 'crap-report.json'), JSON.stringify({ [first]: {}, [second]: { second: fn('second') } }));
    writeFileSync(path.join(output, 'summary.json'), JSON.stringify({
      project: 'demo', limit: 30, files: 2, sourceFiles: [first, second], functions: 1, violations: 0, max: 1,
    }));
    assert.throws(() => verifyReports(['demo'], directory), /first\.ts contains 1 source functions but analysis has 0 and coverage has 1/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('per-file function analysis cannot omit source functions when both reports agree', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'crap-omitted-same-file-function-'));
  const output = path.join(directory, 'coverage/crap/demo');
  const source = path.join(directory, 'demo/source.tsx');
  try {
    mkdirSync(path.join(output, 'html'), { recursive: true });
    mkdirSync(path.dirname(source), { recursive: true });
    writeFileSync(source, 'export function included() { return <span />; }\nexport function omitted() { return <span />; }\n');
    writeFileSync(path.join(output, 'html/index.html'), '<html></html>');
    writeFileSync(path.join(output, 'coverage-final.json'), JSON.stringify({
      [source]: { path: source, statementMap: {}, s: {}, fnMap: { included: { name: 'included' } }, f: { included: 0 }, branchMap: {}, b: {} },
    }));
    writeFileSync(path.join(output, 'crap-report.json'), JSON.stringify({
      [source]: { included: { functionDescriptor: 'included', start: { line: 1 }, complexity: 1, statements: { crap: 1, coverage: 1 } } },
    }));
    writeFileSync(path.join(output, 'summary.json'), JSON.stringify({
      project: 'demo', limit: 30, files: 1, sourceFiles: [source], functions: 1, violations: 0, max: 1,
    }));
    assert.throws(() => verifyReports(['demo'], directory), /source\.tsx contains 2 source functions but analysis has 1 and coverage has 1/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('source completeness counts callback functions inside decorators', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'crap-decorator-function-count-'));
  const source = path.join(directory, 'decorated.ts');
  try {
    writeFileSync(source, 'class Example { @decorate(() => Service) method() {} }\nfunction decorate(value: unknown) { return value; }\n');
    assert.equal(sourceFunctionCount(source), 3);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('report validation rejects an omitted decorator callback from both maps', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'crap-omitted-decorator-callback-'));
  const output = path.join(directory, 'coverage/crap/demo');
  const source = path.join(directory, 'demo/decorated.ts');
  try {
    mkdirSync(path.join(output, 'html'), { recursive: true });
    mkdirSync(path.dirname(source), { recursive: true });
    writeFileSync(
      source,
      'function decorate(callback: (value: number) => number) { return callback; }\nclass Example { @decorate((value: number) => value) method() { return 1; } }\n',
    );
    writeFileSync(path.join(output, 'html/index.html'), '<html></html>');
    const functions = {
      helper: { name: 'decorate', loc: { start: { line: 1 } } },
      method: { name: 'method', loc: { start: { line: 2 } } },
    };
    writeFileSync(
      path.join(output, 'coverage-final.json'),
      JSON.stringify({
        [source]: {
          path: source,
          statementMap: {}, s: {},
          fnMap: functions,
          f: { helper: 0, method: 0 },
          branchMap: {}, b: {},
        },
      }),
    );
    const fn = (name) => ({
      functionDescriptor: name,
      start: { line: 1 },
      complexity: 1,
      statements: { crap: 1, coverage: 1 },
    });
    writeFileSync(path.join(output, 'crap-report.json'), JSON.stringify({ [source]: { helper: fn('helper'), method: fn('method') } }));
    writeFileSync(path.join(output, 'summary.json'), JSON.stringify({
      project: 'demo', limit: 30, files: 1, sourceFiles: [source], functions: 2, violations: 0, max: 1,
    }));
    assert.throws(() => verifyReports(['demo'], directory), /decorated\.ts contains 3 source functions but analysis has 2 and coverage has 2/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('source completeness matches Istanbul for Nest forwardRef decorator callbacks', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'crap-nest-decorator-function-count-'));
  const source = path.join(directory, 'injected.ts');
  try {
    writeFileSync(source, 'class Example { constructor(@Inject(forwardRef(() => Service)) service: Service) {} }\n');
    assert.equal(sourceFunctionCount(source), 2);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('restored project reports are checked against the current inclusive limit', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'crap-restored-report-'));
  const output = path.join(directory, 'coverage/crap/demo');
  const source = path.join(directory, 'demo/example.ts');
  try {
    mkdirSync(path.join(output, 'html'), { recursive: true });
    mkdirSync(path.dirname(source), { recursive: true });
    writeFileSync(source, 'export function example() { return 1; }\n');
    writeFileSync(path.join(output, 'html/index.html'), '<html></html>');
    const coverage = {
      [source]: {
        path: source,
        statementMap: {}, s: {},
        fnMap: { one: { name: 'example', decl: {}, loc: {} } }, f: { one: 0 },
        branchMap: {}, b: {},
      },
    };
    writeFileSync(path.join(output, 'coverage-final.json'), JSON.stringify(coverage));
    const fn = (crap) => ({
      functionDescriptor: 'example',
      start: { line: 4 },
      complexity: 6,
      statements: { crap, coverage: 0.5 },
    });
    writeFileSync(path.join(output, 'crap-report.json'), JSON.stringify({ 'demo/example.ts': { example: fn(30) } }));
    writeFileSync(path.join(output, 'summary.json'), JSON.stringify({ project: 'demo', limit: 30, files: 1, sourceFiles: [source], functions: 1, violations: 0, max: 30 }));
    assert.doesNotThrow(() => verifyReports(['demo'], directory), 'a cached score exactly at 30 passes');
    writeFileSync(path.join(output, 'crap-report.json'), JSON.stringify({ 'demo/example.ts': { example: fn(30.0001) } }));
    writeFileSync(path.join(output, 'summary.json'), JSON.stringify({ project: 'demo', limit: 30, files: 1, sourceFiles: [source], functions: 1, violations: 1, max: 30.0001 }));
    assert.throws(() => verifyReports(['demo'], directory), /CRAP score limit 30 exceeded/);
    writeFileSync(path.join(output, 'summary.json'), JSON.stringify({ project: 'demo', limit: 30, files: 1, sourceFiles: [source], functions: 0, violations: 0, max: 0 }));
    assert.throws(() => verifyReports(['demo'], directory), /Incomplete function analysis/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('commit validation accepts staged source, rejects partial edits and ignores generated caches', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'crap-staged-'));
  // Git hooks export their repository paths and alternate index. These fixture
  // repositories must use their own metadata and index, never the caller's.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const git = (...args) => execFileSync('git', args, { cwd: dir, env, stdio: 'ignore' });
  const check = () =>
    spawnSync(process.execPath, [path.join(workspace, 'scripts/crap-score/check-staged.mjs')], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
  try {
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFileSync(path.join(dir, 'source.ts'), 'export const value = 1;\n');
    git('add', 'source.ts');
    git('commit', '-qm', 'baseline');

    writeFileSync(path.join(dir, 'source.ts'), 'export const value = 2;\n');
    git('add', 'source.ts');
    assert.equal(check().status, 0, 'fully staged JS/TS must validate');

    writeFileSync(path.join(dir, 'source.ts'), 'export const value = 3;\n');
    const indexBefore = execFileSync('git', ['show', ':source.ts'], { cwd: dir, encoding: 'utf8', env });
    const worktreeBefore = readFileSync(path.join(dir, 'source.ts'), 'utf8');
    const status = check();
    assert.equal(status.status, 1);
    assert.match(status.stderr, /Unstaged relevant paths: source\.ts/);
    assert.equal(execFileSync('git', ['show', ':source.ts'], { cwd: dir, encoding: 'utf8', env }), indexBefore);
    assert.equal(readFileSync(path.join(dir, 'source.ts'), 'utf8'), worktreeBefore);

    git('checkout', '--', 'source.ts');
    writeFileSync(path.join(dir, '.swcrc'), '{"jsc":{}}\n');
    git('add', '.swcrc');
    writeFileSync(path.join(dir, '.swcrc'), '{"jsc":{"target":"es2022"}}\n');
    const configIndexBefore = execFileSync('git', ['show', ':.swcrc'], { cwd: dir, encoding: 'utf8', env });
    const configWorktreeBefore = readFileSync(path.join(dir, '.swcrc'), 'utf8');
    const configStatus = check();
    assert.equal(configStatus.status, 1);
    assert.match(configStatus.stderr, /Unstaged relevant paths: \.swcrc/);
    assert.equal(execFileSync('git', ['show', ':.swcrc'], { cwd: dir, encoding: 'utf8', env }), configIndexBefore);
    assert.equal(readFileSync(path.join(dir, '.swcrc'), 'utf8'), configWorktreeBefore);

    git('checkout', '--', '.swcrc');
    mkdirSync(path.join(dir, 'patches'), { recursive: true });
    writeFileSync(path.join(dir, 'patches/crap-score.patch'), 'first patch\n');
    git('add', 'patches/crap-score.patch');
    writeFileSync(path.join(dir, 'source.ts'), 'export const guarded = true;\n');
    git('add', 'source.ts');
    writeFileSync(path.join(dir, 'patches/crap-score.patch'), 'worktree-only scorer fix\n');
    const patchIndexBefore = execFileSync('git', ['show', ':patches/crap-score.patch'], { cwd: dir, encoding: 'utf8', env });
    const patchWorktreeBefore = readFileSync(path.join(dir, 'patches/crap-score.patch'), 'utf8');
    const patchStatus = check();
    assert.equal(patchStatus.status, 1);
    assert.match(patchStatus.stderr, /Unstaged relevant paths: patches\/crap-score\.patch/);
    assert.equal(execFileSync('git', ['show', ':patches/crap-score.patch'], { cwd: dir, encoding: 'utf8', env }), patchIndexBefore);
    assert.equal(readFileSync(path.join(dir, 'patches/crap-score.patch'), 'utf8'), patchWorktreeBefore);

    git('checkout', '--', 'patches/crap-score.patch', 'source.ts');
    mkdirSync(path.join(dir, '.nx-cache/hash/project/src'), { recursive: true });
    writeFileSync(path.join(dir, '.nx-cache/hash/project/src/generated.ts'), 'export const cached = true;\n');
    assert.equal(check().status, 0, 'generated Nx cache data is not a proposed source change');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the inclusive maximum passes 30 and fails above 30 without rounding', () => {
  assert.deepEqual(summarizeScores([29.99, 30, 30.01].map((crap) => ({ statements: { crap } }))), {
    functions: 3,
    violations: 1,
    max: 30.01,
  });
  assert.deepEqual(summarizeScores([]), { functions: 0, violations: 0, max: 0 });
  const fn = (crap) => ({ functionDescriptor: 'example', start: { line: 7 }, complexity: 6, statements: { crap, coverage: 0.5 } });
  assert.doesNotThrow(() => enforceScores('demo', { '/repo/example.ts': { ok: fn(29.99), boundary: fn(30) } }));
  assert.throws(
    () => enforceScores('demo', { '/repo/example.ts': { violation: fn(30.0001) } }),
    /demo: .*example\.ts:7 example — CRAP 30\.0001 \(complexity 6, coverage 50\.00%\)/,
  );
  assert.doesNotThrow(() => enforceScores('empty', {}));
  assert.throws(() => enforceScores('malformed', { '/repo/a.ts': { bad: { statements: {} } } }), /Malformed CRAP function/);
});

test('a controlled above-limit project fails with retained reports and passes after reducing complexity', async () => {
  const projectRoot = `apps/__crap-score-fixture-${process.pid}`;
  const fixturePath = path.join(workspace, projectRoot);
  const output = mkdtempSync(path.join(os.tmpdir(), 'attraccess-crap-gate-'));
  try {
    mkdirSync(fixturePath, { recursive: true });
    writeFileSync(path.join(fixturePath, 'project.json'), JSON.stringify({ name: 'crap-gate-fixture', root: projectRoot }));
    const source = path.join(fixturePath, 'source.ts');
    writeFileSync(source, [
      'export function controlled(value: number) {',
      ...Array.from({ length: 8 }, (_, index) => `  if (value === ${index}) return ${index};`),
      '  return -1;',
      '}',
    ].join('\n'));
    const invoke = () => spawnSync(process.execPath, [
      '--input-type=module', '-e',
      `import { run } from ${JSON.stringify(new URL('./run.mjs', import.meta.url).href)}; await run(${JSON.stringify(projectRoot)}, ${JSON.stringify(output)});`,
    ], { cwd: workspace, encoding: 'utf8' });
    const failing = invoke();
    assert.equal(failing.status, 1, failing.stderr);
    assert.match(failing.stderr, /CRAP score limit 30 exceeded/);
    assert.ok(existsSync(path.join(output, 'coverage-final.json')));
    assert.ok(existsSync(path.join(output, 'crap-report.json')));
    assert.ok(existsSync(path.join(output, 'summary.json')));
    assert.ok(existsSync(path.join(output, 'html/index.html')));
    assert.ok(JSON.parse(readFileSync(path.join(output, 'summary.json'), 'utf8')).max > 30);
    writeFileSync(source, 'export function controlled(value: number) { return value; }\n');
    const passing = invoke();
    assert.equal(passing.status, 0, passing.stderr);
    assert.ok(JSON.parse(readFileSync(path.join(output, 'summary.json'), 'utf8')).max <= 30);
  } finally {
    rmSync(fixturePath, { recursive: true, force: true });
    rmSync(output, { recursive: true, force: true });
  }
});

test('Husky pre-commit and the CI affected command reject and then accept a controlled function', { timeout: 180000 }, () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'attraccess-crap-entrypoints-'));
  const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const git = (...args) => execFileSync('git', args, { cwd: directory, env: gitEnv, stdio: 'ignore' });
  const invoke = (command, args) => spawnSync(command, args, {
    cwd: directory,
    encoding: 'utf8',
    env: { ...gitEnv, NX_DAEMON: 'false', NX_SKIP_NX_CACHE: 'true' },
  });
  try {
    cpSync(path.join(workspace, 'scripts/crap-score'), path.join(directory, 'scripts/crap-score'), { recursive: true });
    cpSync(path.join(workspace, '.husky/pre-commit'), path.join(directory, '.husky/pre-commit'));
    symlinkSync(path.join(workspace, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
    writeFileSync(path.join(directory, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
    const rootPackage = JSON.parse(readFileSync(path.join(workspace, 'package.json'), 'utf8'));
    writeFileSync(path.join(directory, 'package.json'), JSON.stringify({
      name: 'crap-entrypoint-fixture',
      private: true,
      packageManager: rootPackage.packageManager,
      scripts: {
        // File-size limits are a separate gate with their own tests; this fixture checks CRAP enforcement.
        'lint:files': 'true',
        precommit: rootPackage.scripts.precommit,
        'crap-score:affected': rootPackage.scripts['crap-score:affected'],
      },
    }, null, 2));
    writeFileSync(path.join(directory, 'nx.json'), JSON.stringify({ targetDefaults: { 'crap-score': { cache: false } } }));
    mkdirSync(path.join(directory, 'apps/fixture'), { recursive: true });
    writeFileSync(path.join(directory, 'apps/fixture/project.json'), JSON.stringify({
      name: 'crap-entrypoint-fixture',
      root: 'apps/fixture',
      targets: {
        'crap-score': { executor: 'nx:run-commands', options: { command: 'node scripts/crap-score/run.mjs apps/fixture' } },
      },
    }));
    const source = path.join(directory, 'apps/fixture/source.mjs');
    const testFile = path.join(directory, 'apps/fixture/source.test.mjs');
    const setComplex = (branches) => writeFileSync(source, [
      'export function controlled(value) {',
      ...Array.from({ length: branches }, (_, index) => `  if (value === ${index}) return ${index};`),
      '  return -1;',
      '}\n',
    ].join('\n'));
    writeFileSync(testFile, "import test from 'node:test';\nimport './source.mjs';\ntest('controlled source loads', () => {});\n");
    setComplex(1);
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    git('add', '.');
    git('commit', '-qm', 'fixture baseline');

    setComplex(8);
    git('add', 'apps/fixture/source.mjs');
    const huskyFail = invoke('sh', ['.husky/pre-commit']);
    assert.notEqual(huskyFail.status, 0, huskyFail.stdout);
    assert.match(huskyFail.stdout + huskyFail.stderr, /CRAP score limit 30 exceeded/);
    git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'over-limit function');

    const ciFail = invoke('pnpm', ['crap-score:affected', '--base=HEAD~1']);
    assert.notEqual(ciFail.status, 0, ciFail.stdout);
    assert.match(ciFail.stdout + ciFail.stderr, /CRAP score limit 30 exceeded/);

    setComplex(1);
    git('add', 'apps/fixture/source.mjs');
    const huskyPass = invoke('sh', ['.husky/pre-commit']);
    assert.equal(huskyPass.status, 0, huskyPass.stdout + huskyPass.stderr);
    git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'reduce complexity');
    const ciPass = invoke('pnpm', ['crap-score:affected', '--base=HEAD~1']);
    assert.equal(ciPass.status, 0, ciPass.stdout + ciPass.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

