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
    const patchIndexBefore = execFileSync('git', ['show', ':patches/crap-score.patch'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    const patchWorktreeBefore = readFileSync(path.join(dir, 'patches/crap-score.patch'), 'utf8');
    const patchStatus = check();
    assert.equal(patchStatus.status, 1);
    assert.match(patchStatus.stderr, /Unstaged relevant paths: patches\/crap-score\.patch/);
    assert.equal(
      execFileSync('git', ['show', ':patches/crap-score.patch'], { cwd: dir, encoding: 'utf8', env }),
      patchIndexBefore,
    );
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

test(
  'the pre-commit hook and the CI affected command reject and then accept a controlled function',
  { timeout: 300000 },
  () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'attraccess-crap-entrypoints-'));
    const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
    const git = (...args) => execFileSync('git', args, { cwd: directory, env: gitEnv, stdio: 'ignore' });
    const invoke = (command, args) =>
      spawnSync(command, args, {
        cwd: directory,
        encoding: 'utf8',
        env: { ...gitEnv, NX_DAEMON: 'false', NX_SKIP_NX_CACHE: 'true' },
      });
    try {
      cpSync(path.join(workspace, 'scripts/crap-score'), path.join(directory, 'scripts/crap-score'), {
        recursive: true,
      });
      cpSync(path.join(workspace, 'scripts/precommit.sh'), path.join(directory, 'scripts/precommit.sh'));
      cpSync(path.join(workspace, '.husky/pre-commit'), path.join(directory, '.husky/pre-commit'));
      symlinkSync(path.join(workspace, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
      writeFileSync(path.join(directory, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
      const rootPackage = JSON.parse(readFileSync(path.join(workspace, 'package.json'), 'utf8'));
      writeFileSync(
        path.join(directory, 'package.json'),
        JSON.stringify(
          {
            name: 'crap-entrypoint-fixture',
            private: true,
            packageManager: rootPackage.packageManager,
            scripts: {
              // File-size limits are a separate gate with their own tests; this fixture checks CRAP enforcement.
              'lint:files': 'true',
              precommit: rootPackage.scripts.precommit,
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
      git('init', '-q');
      git('config', 'user.email', 'test@example.com');
      git('config', 'user.name', 'Test');
      git('add', '.');
      git('commit', '-qm', 'fixture baseline');

      setComplex(8);
      git('add', 'apps/fixture/source.mjs');
      const hookFail = invoke('sh', ['.husky/pre-commit']);
      assert.notEqual(hookFail.status, 0, hookFail.stdout);
      assert.match(hookFail.stdout + hookFail.stderr, /CRAP score limit 30 exceeded/);
      git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'over-limit function');

      const ciFail = invoke('pnpm', ['crap-score:affected', '--base=HEAD~1']);
      assert.notEqual(ciFail.status, 0, ciFail.stdout);
      assert.match(ciFail.stdout + ciFail.stderr, /CRAP score limit 30 exceeded/);

      setComplex(1);
      git('add', 'apps/fixture/source.mjs');
      const hookPass = invoke('sh', ['.husky/pre-commit']);
      assert.equal(hookPass.status, 0, hookPass.stdout + hookPass.stderr);
      git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'reduce complexity');
      const ciPass = invoke('pnpm', ['crap-score:affected', '--base=HEAD~1']);
      assert.equal(ciPass.status, 0, ciPass.stdout + ciPass.stderr);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
