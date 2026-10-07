import { getCrapReport } from 'crap-score';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { completeCoverage, nodeCoverage, run, summarizeScores } from './run.mjs';

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
    for (const [file, functions] of Object.entries(report)) {
      for (const index of Object.keys(Object.values(functions))) {
        const page = readFileSync(path.join(directory, 'html', file, `${index}.html`), 'utf8');
        assert.ok(page.trimEnd().endsWith('</html>'), `Incomplete function page: ${file}/${index}`);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('HTML reporting waits for every function page before resolving', async () => {
  const { createRequire } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  const require = createRequire(import.meta.url);
  const servicePath = path.join(path.dirname(require.resolve('crap-score')), 'crap/html-report/html-report.service.js');
  const { HtmlReportService } = await import(pathToFileURL(servicePath).href);
  let notifyStarted;
  const started = new Promise((resolve) => {
    notifyStarted = resolve;
  });
  let finishPage;
  const pendingPage = new Promise((resolve) => {
    finishPage = resolve;
  });
  const written = [];
  const service = new HtmlReportService(
    {
      loadSourceFile: async () => '',
      loadHandlebarsTemplate: async () => () => '<html></html>',
      writeHtmlReport: async (file) => {
        if (file.endsWith('/0.html')) {
          notifyStarted();
          await pendingPage;
        }
        written.push(file);
      },
    },
    { getHtmlReportDir: () => '/reports' },
  );
  let resolved = false;
  const report = service.createReport({ 'source.ts': { run: { statements: { crap: 2 } } } }).then(() => {
    resolved = true;
  });
  await started;
  // The overview and completion must be ordered after the blocked function write.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resolved, false);
  assert.deepEqual(written, []);
  finishPage();
  await report;
  assert.deepEqual(written, ['/reports/source.ts/0.html', '/reports/index.html']);
});
