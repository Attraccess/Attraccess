import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  coverageDirectory,
  enforceScores,
  run,
  sourceFunctionCount,
  summarizeScores,
  validateFunctionCompleteness,
  workspace,
} from './run.mjs';
import { nodeCoverage } from './node-test.mjs';
import { fixtureGitEnv } from '../test-utils/git-env.mjs';

// Analysis and coverage function maps for validateFunctionCompleteness.
const analysis = (name) => ({
  functionDescriptor: name,
  start: { line: 1 },
  complexity: 1,
  statements: { crap: 1, coverage: 1 },
});
const coverageEntry = (file, names = []) => ({
  path: file,
  statementMap: {},
  s: {},
  fnMap: Object.fromEntries(names.map((name) => [name, { name, loc: { start: { line: 1 } } }])),
  f: Object.fromEntries(names.map((name) => [name, 0])),
  branchMap: {},
  b: {},
});

function withSources(sources, check) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'crap-completeness-'));
  try {
    const files = Object.entries(sources).map(([name, source]) => {
      const file = path.join(directory, name);
      writeFileSync(file, source);
      return file;
    });
    check(files);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('empty analysis is rejected when source contains a function', () => {
  withSources({ 'source.ts': 'export function work() { return 1; }\n' }, ([source]) => {
    assert.throws(
      () => validateFunctionCompleteness('demo', [source], { [source]: {} }, { [source]: coverageEntry(source) }),
      /contains 1 source functions but analysis has 0 and coverage has 0/,
    );
  });
});

test('function analysis completeness is checked separately for every source file', () => {
  withSources(
    {
      'populated.ts': 'export function included() { return 1; }\n',
      'omitted.ts': 'export function omitted() { return 2; }\n',
    },
    ([populated, omitted]) => {
      const report = { [populated]: { included: analysis('included') }, [omitted]: {} };
      const coverage = { [populated]: coverageEntry(populated, ['included']), [omitted]: coverageEntry(omitted) };
      assert.throws(
        () => validateFunctionCompleteness('demo', [populated, omitted], report, coverage),
        /omitted\.ts contains 1 source functions but analysis has 0 and coverage has 0/,
      );
    },
  );
});

test('per-file function counts must agree even when project totals agree', () => {
  withSources(
    { 'first.ts': 'export function first() { return 1; }\n', 'second.ts': 'export function second() { return 2; }\n' },
    ([first, second]) => {
      const report = { [first]: {}, [second]: { second: analysis('second') } };
      const coverage = { [first]: coverageEntry(first, ['first']), [second]: coverageEntry(second) };
      assert.throws(
        () => validateFunctionCompleteness('demo', [first, second], report, coverage),
        /first\.ts contains 1 source functions but analysis has 0 and coverage has 1/,
      );
    },
  );
});

test('per-file function analysis cannot omit source functions when both reports agree', () => {
  withSources(
    {
      'source.tsx': 'export function included() { return <span />; }\nexport function omitted() { return <span />; }\n',
    },
    ([source]) => {
      const report = { [source]: { included: analysis('included') } };
      assert.throws(
        () => validateFunctionCompleteness('demo', [source], report, { [source]: coverageEntry(source, ['included']) }),
        /source\.tsx contains 2 source functions but analysis has 1 and coverage has 1/,
      );
    },
  );
});

test('source completeness counts callback functions inside decorators', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'crap-decorator-function-count-'));
  const source = path.join(directory, 'decorated.ts');
  try {
    writeFileSync(
      source,
      'class Example { @decorate(() => Service) method() {} }\nfunction decorate(value: unknown) { return value; }\n',
    );
    assert.equal(sourceFunctionCount(source), 3);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('analysis rejects an omitted decorator callback from both maps', () => {
  withSources(
    {
      'decorated.ts':
        'function decorate(callback: (value: number) => number) { return callback; }\nclass Example { @decorate((value: number) => value) method() { return 1; } }\n',
    },
    ([source]) => {
      const report = { [source]: { helper: analysis('helper'), method: analysis('method') } };
      assert.throws(
        () =>
          validateFunctionCompleteness('demo', [source], report, {
            [source]: coverageEntry(source, ['helper', 'method']),
          }),
        /decorated\.ts contains 3 source functions but analysis has 2 and coverage has 2/,
      );
    },
  );
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

test('crap-score reads the coverage its test targets wrote and fails when one wrote none', async () => {
  const projectRoot = `apps/__crap-score-coverage-${process.pid}`;
  const fixturePath = path.join(workspace, projectRoot);
  const output = mkdtempSync(path.join(os.tmpdir(), 'attraccess-crap-coverage-'));
  try {
    mkdirSync(fixturePath, { recursive: true });
    const project = {
      name: 'crap-coverage-fixture',
      root: projectRoot,
      targets: { 'crap-score': { dependsOn: ['test'] } },
    };
    writeFileSync(path.join(fixturePath, 'project.json'), JSON.stringify(project));
    writeFileSync(
      path.join(fixturePath, 'source.mjs'),
      [
        'export function choose(value) {',
        ...Array.from({ length: 8 }, (_, index) => `  if (value === ${index}) return ${index};`),
        '  return -1;',
        '}\n',
      ].join('\n'),
    );
    const suite = path.join(fixturePath, 'source.test.mjs');
    writeFileSync(
      suite,
      "import test from 'node:test';\nimport { choose } from './source.mjs';\n" +
        "test('every branch', () => { for (let value = -1; value < 8; value++) choose(value); });\n",
    );
    await assert.rejects(run(projectRoot, output), /crap-coverage-fixture:test wrote no coverage/);
    const status = nodeCoverage(
      [path.join(projectRoot, 'source.mjs')],
      [suite],
      coverageDirectory(projectRoot, 'test'),
    );
    assert.equal(status, 0);
    await run(projectRoot, output);
    assert.ok(JSON.parse(readFileSync(path.join(output, 'summary.json'), 'utf8')).max <= 30);
  } finally {
    rmSync(fixturePath, { recursive: true, force: true });
    rmSync(path.join(workspace, 'coverage', projectRoot), { recursive: true, force: true });
    rmSync(output, { recursive: true, force: true });
  }
});

test('the inclusive maximum passes 30 and fails above 30 without rounding', () => {
  assert.deepEqual(summarizeScores([29.99, 30, 30.01].map((crap) => ({ statements: { crap } }))), {
    functions: 3,
    violations: 1,
    max: 30.01,
  });
  assert.deepEqual(summarizeScores([]), { functions: 0, violations: 0, max: 0 });
  const fn = (crap) => ({
    functionDescriptor: 'example',
    start: { line: 7 },
    complexity: 6,
    statements: { crap, coverage: 0.5 },
  });
  assert.doesNotThrow(() => enforceScores('demo', { '/repo/example.ts': { ok: fn(29.99), boundary: fn(30) } }));
  assert.throws(
    () => enforceScores('demo', { '/repo/example.ts': { violation: fn(30.0001) } }),
    /demo: .*example\.ts:7 example — CRAP 30\.0001 \(complexity 6, coverage 50\.00%\)/,
  );
  assert.doesNotThrow(() => enforceScores('empty', {}));
  assert.throws(
    () => enforceScores('malformed', { '/repo/a.ts': { bad: { statements: {} } } }),
    /Malformed CRAP function/,
  );
});

test('a controlled above-limit project fails with retained reports and passes after reducing complexity', async () => {
  const projectRoot = `apps/__crap-score-fixture-${process.pid}`;
  const fixturePath = path.join(workspace, projectRoot);
  const output = mkdtempSync(path.join(os.tmpdir(), 'attraccess-crap-gate-'));
  try {
    mkdirSync(fixturePath, { recursive: true });
    writeFileSync(
      path.join(fixturePath, 'project.json'),
      JSON.stringify({ name: 'crap-gate-fixture', root: projectRoot }),
    );
    const source = path.join(fixturePath, 'source.ts');
    writeFileSync(
      source,
      [
        'export function controlled(value: number) {',
        ...Array.from({ length: 8 }, (_, index) => `  if (value === ${index}) return ${index};`),
        '  return -1;',
        '}',
      ].join('\n'),
    );
    const invoke = () =>
      spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import { run } from ${JSON.stringify(new URL('./run.mjs', import.meta.url).href)}; await run(${JSON.stringify(projectRoot)}, ${JSON.stringify(output)});`,
        ],
        { cwd: workspace, encoding: 'utf8' },
      );
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

test('the CI affected command rejects and then accepts a controlled function', { timeout: 300000 }, () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'attraccess-crap-entrypoints-'));
  const gitEnv = fixtureGitEnv();
  const git = (...args) => execFileSync('git', args, { cwd: directory, env: gitEnv, stdio: 'ignore' });
  const invoke = (command, args) =>
    spawnSync(command, args, {
      cwd: directory,
      encoding: 'utf8',
      // The assertions read failure output inline; Nx 24 only prints log file paths when it detects an AI agent.
      env: {
        ...gitEnv,
        NX_DAEMON: 'false',
        NX_SKIP_NX_CACHE: 'true',
        NX_DEFAULT_OUTPUT_STYLE: 'static-failures-only',
      },
    });
  try {
    cpSync(path.join(workspace, 'scripts/crap-score'), path.join(directory, 'scripts/crap-score'), {
      recursive: true,
    });
    symlinkSync(path.join(workspace, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
    writeFileSync(path.join(directory, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\nverifyDepsBeforeRun: false\n");
    const rootPackage = JSON.parse(readFileSync(path.join(workspace, 'package.json'), 'utf8'));
    writeFileSync(
      path.join(directory, 'package.json'),
      JSON.stringify(
        {
          name: 'crap-entrypoint-fixture',
          private: true,
          packageManager: rootPackage.packageManager,
          scripts: {
            'crap-score:affected': rootPackage.scripts['crap-score:affected'],
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      path.join(directory, 'nx.json'),
      JSON.stringify({ targetDefaults: { 'crap-score': { cache: false } } }),
    );
    mkdirSync(path.join(directory, 'apps/fixture'), { recursive: true });
    const command = (value) => ({ executor: 'nx:run-commands', options: { command: value } });
    writeFileSync(
      path.join(directory, 'apps/fixture/project.json'),
      JSON.stringify({
        name: 'crap-entrypoint-fixture',
        root: 'apps/fixture',
        targets: {
          test: command(
            'node scripts/crap-score/node-test.mjs apps/fixture coverage/apps/fixture/test apps/fixture/source.test.mjs',
          ),
          'crap-score': { ...command('node scripts/crap-score/run.mjs apps/fixture'), dependsOn: ['test'] },
        },
      }),
    );
    const source = path.join(directory, 'apps/fixture/source.mjs');
    const setComplex = (branches) =>
      writeFileSync(
        source,
        [
          'export function controlled(value) {',
          ...Array.from({ length: branches }, (_, index) => `  if (value === ${index}) return ${index};`),
          '  return -1;',
          '}\n',
        ].join('\n'),
      );
    writeFileSync(
      path.join(directory, 'apps/fixture/source.test.mjs'),
      "import test from 'node:test';\nimport './source.mjs';\ntest('controlled source loads', () => {});\n",
    );
    setComplex(1);
    // pnpm 12 records the pinned packageManager in a stub pnpm-lock.yaml on first use, which Nx cannot parse;
    // commit a full lockfile like the real workspace has.
    invoke('pnpm', ['install', '--lockfile-only']);
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    git('add', '.');
    git('commit', '-qm', 'fixture baseline');

    setComplex(8);
    git('add', 'apps/fixture/source.mjs');
    git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'over-limit function');

    const ciFail = invoke('pnpm', ['crap-score:affected', '--base=HEAD~1']);
    assert.notEqual(ciFail.status, 0, ciFail.stdout);
    assert.match(ciFail.stdout + ciFail.stderr, /CRAP score limit 30 exceeded/);

    setComplex(1);
    git('add', 'apps/fixture/source.mjs');
    git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'reduce complexity');
    const ciPass = invoke('pnpm', ['crap-score:affected', '--base=HEAD~1']);
    assert.equal(ciPass.status, 0, ciPass.stdout + ciPass.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
