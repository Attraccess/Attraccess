/* eslint-disable no-console -- CLI progress and diagnostics are intentional. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import istanbulCoverage from 'istanbul-lib-coverage';
const { createCoverageMap } = istanbulCoverage;
import { createInstrumenter } from 'istanbul-lib-instrument';
import { getCrapReport } from 'crap-score';

export const workspace = fileURLToPath(new URL('../../', import.meta.url));

export function isSource(file) {
  return (
    /\.[cm]?[jt]sx?$/.test(file) &&
    // Upstream OpenSCAD WebAssembly runtime, distributed unchanged with the app.
    file !== 'apps/frontend/public/openscad/openscad.wasm.js' &&
    !/(^|\/)(__tests__|__mocks__|test|tests|test-utils|fixtures|generated|node_modules|dist|package)(\/|$)/.test(
      file,
    ) &&
    !/\.(spec|test|config|d)\.[cm]?[jt]sx?$/.test(file) &&
    !/(^|\/)(test-setup|jest\.setup)\.[jt]s$/.test(file) &&
    !/^libs\/(react-query-client|companion-ws-client)\/src\/lib\//.test(file)
  );
}

export function completeCoverage(files, reports) {
  const coverage = createCoverageMap({});
  for (const report of reports) coverage.merge(report);
  const wanted = new Set(files.map((file) => path.resolve(workspace, file)));
  coverage.filter((file) => wanted.has(file));
  for (const file of wanted) {
    const instrumenter = createInstrumenter({
      // JSX is only enabled on JSX files: otherwise TS generic arrow functions are ambiguous.
      parserPlugins: ['typescript', 'decorators-legacy', ...(/\.[jt]sx$/.test(file) ? ['jsx'] : [])],
    });
    instrumenter.instrumentSync(readFileSync(file, 'utf8'), file);
    const original = instrumenter.lastFileCoverage();
    if (!coverage.files().includes(file)) {
      coverage.addFileCoverage(original);
    } else {
      repairFunctionLocations(coverage.fileCoverageFor(file).fnMap, original.fnMap);
    }
    deduplicateFunctions(coverage.fileCoverageFor(file));
  }
  const result = coverage.toJSON();
  // Upstream indexes functions by name. Repeated methods/anonymous names must not overwrite each other.
  for (const file of Object.values(result)) {
    for (const [id, fn] of Object.entries(file.fnMap)) fn.name = `${fn.name}:${fn.loc.start.line}:${id}`;
  }
  return result;
}

// Use complete source ranges, not names or just line numbers: anonymous
// callbacks and same-named methods can share a line and still be distinct.
export function deduplicateFunctions(file) {
  const locations = new Map();
  for (const [id, fn] of Object.entries(file.fnMap)) {
    const key = JSON.stringify([fn.loc.start.line, fn.loc.start.column, fn.loc.end.line, fn.loc.end.column]);
    const existing = locations.get(key);
    if (existing === undefined) {
      locations.set(key, id);
      continue;
    }
    // Duplicated mappings describe the same execution, not additional calls.
    file.f[existing] = Math.max(file.f[existing], file.f[id]);
    delete file.fnMap[id];
    delete file.f[id];
  }
}

export function summarizeScores(functions) {
  return {
    functions: functions.length,
    atLeast30: functions.filter((fn) => fn.statements.crap >= 30).length,
    max: Math.max(0, ...functions.map((fn) => fn.statements.crap)),
  };
}

// Source-map remapping may leave end columns null (end of line). Restore exact
// boundaries from the original source, without changing any execution counts.
export function repairFunctionLocations(measured, original) {
  const before = (a, b) => a.line < b.line || (a.line === b.line && a.column <= b.column);
  const contains = (outer, inner) => before(outer.start, inner.start) && before(inner.end, outer.end);
  for (const fn of Object.values(measured)) {
    if (fn.loc.end.column != null) continue;
    const originals = Object.values(original);
    let matches = originals.filter(
      (candidate) =>
        candidate.loc.start.line === fn.loc.start.line && candidate.loc.start.column === fn.loc.start.column,
    );
    if (matches.length !== 1) {
      const range = { start: fn.loc.start, end: { ...fn.loc.end, column: Infinity } };
      const contained = originals.filter((candidate) => contains(range, candidate.loc));
      matches = contained.filter(
        (candidate) => !contained.some((other) => other !== candidate && contains(other.loc, candidate.loc)),
      );
    }
    // Keep unmatched transformed functions for upstream to resolve or report as errors.
    if (matches.length !== 1) continue;
    fn.loc = matches[0].loc;
    fn.decl = matches[0].decl;
  }
}

function suites(root) {
  if (root === '.') return [];
  const result = [];
  const jestConfig = ['jest.config.ts', 'jest.config.js'].find((file) => existsSync(path.join(root, file)));
  if (jestConfig)
    result.push({
      runner: 'jest',
      cwd: workspace,
      args: [
        '--config',
        path.join(root, jestConfig),
        '--runInBand',
        '--passWithNoTests',
        '--testPathIgnorePatterns=\\.e2e\\.spec\\.ts$',
      ],
    });
  if (root === 'apps/frontend')
    result.push({ runner: 'vitest', cwd: workspace, args: ['--config', `${root}/vitest.config.ts`] });
  if (root === 'apps/plugins/wago')
    result.push({ runner: 'vitest', cwd: workspace, args: ['--config', `${root}/frontend/vitest.config.mts`] });
  if (root === 'apps/plugins/shelly')
    result.push({ runner: 'vitest', cwd: path.join(workspace, root), args: ['--root', 'frontend'] });
  if (['libs/attractap-hw-shared', 'libs/plugins-frontend-sdk', 'libs/plugins-frontend-ui'].includes(root))
    result.push({ runner: 'vitest', cwd: path.join(workspace, root), args: [] });
  return result;
}

export async function run(root) {
  process.chdir(workspace);
  const project = JSON.parse(readFileSync(path.join(root, 'project.json'), 'utf8'));
  const output = path.join(workspace, 'coverage/crap', project.name.replaceAll('/', '__'));
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter((file) => file && existsSync(path.resolve(workspace, file)));
  const roots =
    root === '.' ? ['scripts', 'examples', 'apps/plugins/scripts', 'apps/attractap/hardware/scripts'] : [root];
  const nestedProjects = tracked
    .filter((file) => file.startsWith(`${root}/`) && file.endsWith('/project.json') && file !== `${root}/project.json`)
    .map((file) => path.dirname(file));
  const files = tracked.filter(
    (file) =>
      roots.some((source) => file.startsWith(`${source}/`)) &&
      !nestedProjects.some((nested) => file.startsWith(`${nested}/`)) &&
      isSource(file),
  );
  if (!files.length) throw new Error(`No JS/TS source files found for ${project.name}`);
  const reports = [];
  for (const [index, suite] of suites(root).entries()) {
    const dir = path.join(output, `coverage-${index}`);
    const args =
      suite.runner === 'jest'
        ? ['exec', 'jest', ...suite.args, '--coverage', '--coverageReporters=json', `--coverageDirectory=${dir}`]
        : [
            'exec',
            'vitest',
            'run',
            ...suite.args,
            '--coverage',
            '--coverage.provider=istanbul',
            '--coverage.reporter=json',
            `--coverage.reportsDirectory=${dir}`,
            '--maxWorkers=2',
            '--passWithNoTests',
          ];
    execFileSync('pnpm', args, { cwd: suite.cwd, stdio: 'inherit', env: { ...process.env, CRAP_SCORE_COVERAGE: '1' } });
    const reportFile = path.join(dir, 'coverage-final.json');
    if (!existsSync(reportFile)) throw new Error(`Coverage runner did not write ${reportFile}`);
    reports.push(JSON.parse(readFileSync(reportFile, 'utf8')));
  }
  const testCoverage = completeCoverage(files, reports);
  writeFileSync(path.join(output, 'coverage-final.json'), JSON.stringify(testCoverage));
  const errors = [];
  const report = await getCrapReport({
    testCoverage,
    jsonReportFile: path.join(output, 'crap-report.json'),
    htmlReportDir: path.join(output, 'html'),
    log: {
      log() {
        /* Suppress upstream informational output. */
      },
      warn: (...args) => console.warn(...args),
      error: (...args) => {
        errors.push(args);
        console.error(...args);
      },
      debug() {
        /* Keep per-function debug output quiet. */
      },
      verbose() {
        /* Keep verbose output quiet. */
      },
    },
  });
  if (errors.length) throw new Error(`CRAP analysis reported ${errors.length} errors; see output above.`);
  const functions = Object.values(report).flatMap((file) => Object.values(file));
  const summary = {
    project: project.name,
    files: files.length,
    ...summarizeScores(functions),
  };
  writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(
    `CRAP ${project.name}: ${summary.functions} functions, ${summary.atLeast30} at or above 30, max ${summary.max.toFixed(2)}. Reports: ${path.relative(workspace, output)}`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await run(process.argv[2] ?? '.');
}
