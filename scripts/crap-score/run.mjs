/* eslint-disable no-console -- CLI progress and diagnostics are intentional. */
import { getCrapReport } from 'crap-score';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { completeCoverage } from './complete-coverage.mjs';
import { nodeCoverage, suites } from './coverage-runners.mjs';
import { isSource, ownedFiles, workspace } from './project-sources.mjs';

// Re-export declarations have no source functions, even in files that also
// contain maintained functions. TypeScript's generated getters are scaffolding.
// Use complete source ranges, not names or just line numbers: anonymous
// callbacks and same-named methods can share a line and still be distinct.
// Runners can map the same statement with a concrete end column or an
// end-of-line sentinel. Repairing those ranges after merging must not leave a
// second, uncovered copy of a statement another runner already exercised.

export function summarizeScores(functions) {
  return {
    functions: functions.length,
    atLeast30: functions.filter((fn) => fn.statements.crap >= 30).length,
    max: Math.max(0, ...functions.map((fn) => fn.statements.crap)),
  };
}

// Source-map remapping may leave end columns null (end of line). Restore exact
// boundaries from the original source, without changing any execution counts.

export async function run(root, outputDirectory) {
  process.chdir(workspace);
  const project = JSON.parse(readFileSync(path.join(root, 'project.json'), 'utf8'));
  const output = outputDirectory ?? path.join(workspace, 'coverage/crap', project.name.replaceAll('/', '__'));
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter((file) => file && existsSync(path.resolve(workspace, file)));
  const owned = ownedFiles(root, tracked);
  const files = owned.filter(isSource);
  if (!files.length) throw new Error(`No JS/TS source files found for ${project.name}`);
  const nodeTests = owned.filter(
    (file) => /\.(spec|test)\.mjs$/.test(file) && readFileSync(file, 'utf8').includes('node:test'),
  );
  const reports = nodeCoverage(
    files.filter((file) => /\.[cm]?js$/.test(file)),
    nodeTests,
    path.join(output, 'node'),
  );
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

export { completeCoverage } from './complete-coverage.mjs';
export { repairFunctionLocations, repairStatementLocations } from './coverage-locations.mjs';
export {
  deduplicateFunctions,
  deduplicateStatements,
  fillMissingFunctions,
  removeEnumWrappers,
} from './coverage-normalization.mjs';
export { nodeCoverage, suites } from './coverage-runners.mjs';
export { isSource, ownedFiles, workspace } from './project-sources.mjs';
