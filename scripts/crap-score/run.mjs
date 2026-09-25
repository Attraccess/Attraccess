/* eslint-disable no-console -- CLI progress and diagnostics are intentional. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import istanbulCoverage from 'istanbul-lib-coverage';
const { createCoverageMap } = istanbulCoverage;
import { createInstrumenter } from 'istanbul-lib-instrument';
import { getCrapReport } from 'crap-score';
import ts from 'typescript';

export const workspace = fileURLToPath(new URL('../../', import.meta.url));
export const CRAP_SCORE_LIMIT = 30;

export function isSource(file) {
  return (
    /\.[cm]?[jt]sx?$/.test(file) &&
    // Upstream OpenSCAD WebAssembly runtime, distributed unchanged with the app.
    file !== 'apps/frontend/public/openscad/openscad.wasm.js' &&
    !/(^|\/)(__tests__|__mocks__|test|tests|test-utils|fixtures|generated|node_modules|dist|package|\.nx-cache|\.nx-workspace-data|\.electron-cache|\.npm-cache)(\/|$)/.test(
      file,
    ) &&
    !/\.(spec|test|d)\.[cm]?[jt]sx?$/.test(file) &&
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
    const source = readFileSync(file, 'utf8');
    instrumenter.instrumentSync(source, file);
    const original = instrumenter.lastFileCoverage();
    if (!coverage.files().includes(file)) {
      coverage.addFileCoverage(original);
    } else {
      // TypeScript emits export getters for barrels with no source functions.
      // They are compiler scaffolding, not first-party function declarations.
      if (Object.keys(original.fnMap).length === 0) {
        coverage.fileCoverageFor(file).data.fnMap = {};
        coverage.fileCoverageFor(file).data.f = {};
      }
      removeEnumWrappers(coverage.fileCoverageFor(file), file, source);
      removeExportGetters(coverage.fileCoverageFor(file), file, source);
      repairFunctionLocations(coverage.fileCoverageFor(file).fnMap, original.fnMap);
      repairStatementLocations(coverage.fileCoverageFor(file).statementMap, original.statementMap);
      fillMissingFunctions(coverage.fileCoverageFor(file), original);
    }
    deduplicateStatements(coverage.fileCoverageFor(file));
    deduplicateFunctions(coverage.fileCoverageFor(file));
  }
  const result = coverage.toJSON();
  // Upstream indexes functions by name. Repeated methods/anonymous names must not overwrite each other.
  for (const file of Object.values(result)) {
    for (const [id, fn] of Object.entries(file.fnMap)) fn.name = `${fn.name}:${fn.loc.start.line}:${id}`;
  }
  return result;
}

export function removeEnumWrappers(coverage, file, source) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const enumRanges = [];
  const visit = (node) => {
    if (ts.isEnumDeclaration(node)) {
      const start = ast.getLineAndCharacterOfPosition(node.getStart(ast));
      const end = ast.getLineAndCharacterOfPosition(node.getEnd());
      const name = ast.getLineAndCharacterOfPosition(node.name.getStart(ast));
      enumRanges.push({
        start: start.line + 1,
        end: end.line + 1,
        startColumn: start.character,
        nameColumn: name.character,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  for (const [id, fn] of Object.entries(coverage.fnMap)) {
    if (
      !enumRanges.some(
        (range) =>
          fn.loc.start.line === range.start &&
          fn.loc.end.line === range.end &&
          fn.loc.start.column >= range.startColumn &&
          fn.loc.start.column <= range.nameColumn,
      )
    )
      continue;
    delete coverage.fnMap[id];
    delete coverage.f[id];
  }
}

// Re-export declarations have no source functions, even in files that also
// contain maintained functions. TypeScript's generated getters are scaffolding.
function removeExportGetters(coverage, file, source) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const ranges = ast.statements.filter(ts.isExportDeclaration).map((node) => ({
    start: node.getStart(ast),
    end: node.getEnd(),
  }));
  const position = (point) => ast.getPositionOfLineAndCharacter(point.line - 1, point.column ?? 0);
  for (const [id, fn] of Object.entries(coverage.fnMap)) {
    if (
      ranges.some(
        (range) =>
          position(fn.loc.start) >= range.start &&
          position(fn.loc.start) < range.end &&
          position(fn.loc.end) <= range.end,
      )
    ) {
      delete coverage.fnMap[id];
      delete coverage.f[id];
    }
  }
}

export function fillMissingFunctions(measured, original) {
  const locations = new Set(Object.values(measured.fnMap).map((fn) => JSON.stringify(fn.loc)));
  const statements = new Set(Object.values(measured.statementMap).map((statement) => JSON.stringify(statement)));
  const before = (a, b) => a.line < b.line || (a.line === b.line && a.column <= b.column);
  for (const [id, fn] of Object.entries(original.fnMap)) {
    if (locations.has(JSON.stringify(fn.loc))) continue;
    measured.fnMap[`source-${id}`] = fn;
    measured.f[`source-${id}`] = 0;
    for (const [statementId, statement] of Object.entries(original.statementMap)) {
      if (!before(fn.loc.start, statement.start) || !before(statement.end, fn.loc.end)) continue;
      if (statements.has(JSON.stringify(statement))) continue;
      const key = `source-${statementId}`;
      measured.statementMap[key] = statement;
      measured.s[key] = 0;
      statements.add(JSON.stringify(statement));
    }
  }
}

export function repairStatementLocations(measured, original) {
  for (const [id, statement] of Object.entries(measured)) {
    if (statement.end.column != null) continue;
    const matches = Object.values(original).filter(
      (candidate) =>
        candidate.start.line === statement.start.line &&
        candidate.start.column === statement.start.column &&
        candidate.end.line === statement.end.line,
    );
    if (matches.length > 1)
      throw new Error(`Ambiguous statement source mapping at ${statement.start.line}:${statement.start.column}`);
    if (matches.length === 1) measured[id] = matches[0];
  }
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

// Runners can map the same statement with a concrete end column or an
// end-of-line sentinel. Repairing those ranges after merging must not leave a
// second, uncovered copy of a statement another runner already exercised.
export function deduplicateStatements(file) {
  const locations = new Map();
  for (const [id, statement] of Object.entries(file.statementMap)) {
    const key = JSON.stringify([
      statement.start.line,
      statement.start.column,
      statement.end.line,
      statement.end.column,
    ]);
    const existing = locations.get(key);
    if (existing === undefined) {
      locations.set(key, id);
      continue;
    }
    file.s[existing] = Math.max(file.s[existing], file.s[id]);
    delete file.statementMap[id];
    delete file.s[id];
  }
}

export function summarizeScores(functions) {
  return {
    functions: functions.length,
    violations: functions.filter((fn) => fn.statements.crap > CRAP_SCORE_LIMIT).length,
    max: Math.max(0, ...functions.map((fn) => fn.statements.crap)),
  };
}

export function enforceScores(project, report, limit = CRAP_SCORE_LIMIT) {
  if (!Number.isFinite(limit) || limit < 0) throw new Error(`Invalid CRAP score limit: ${limit}`);
  if (!report || typeof report !== 'object' || Array.isArray(report))
    throw new Error(`Malformed CRAP report for ${project}: expected a file map`);
  const violations = [];
  for (const [file, functions] of Object.entries(report)) {
    if (!functions || typeof functions !== 'object' || Array.isArray(functions))
      throw new Error(`Malformed CRAP report for ${project}: ${file}`);
    for (const [key, fn] of Object.entries(functions)) {
      const score = fn?.statements?.crap;
      if (
        !Number.isFinite(score) ||
        !Number.isFinite(fn?.complexity) ||
        !Number.isFinite(fn?.start?.line) ||
        !Number.isFinite(fn?.statements?.coverage) ||
        fn.statements.coverage < 0 ||
        fn.statements.coverage > 1
      )
        throw new Error(`Malformed CRAP function report for ${project}: ${file} (${key})`);
      if (score > limit) {
        const coverage = fn.statements?.coverage;
        violations.push(
          `${project}: ${path.relative(workspace, file)}:${fn.start.line} ${fn.functionDescriptor ?? key} — CRAP ${score} (complexity ${fn.complexity}, coverage ${(coverage * 100).toFixed(2)}%)`,
        );
      }
    }
  }
  if (violations.length) throw new Error(`CRAP score limit ${limit} exceeded by ${violations.length} function(s):\n${violations.join('\n')}`);
}

// Source-map remapping may leave end columns null (end of line). Restore exact
// boundaries from the original source, without changing any execution counts.
export function repairFunctionLocations(measured, original) {
  const before = (a, b) => a.line < b.line || (a.line === b.line && a.column <= b.column);
  const contains = (outer, inner) => before(outer.start, inner.start) && before(inner.end, outer.end);
  for (const fn of Object.values(measured)) {
    const originals = Object.values(original);
    const exactDeclaration = originals.filter(
      (candidate) => JSON.stringify(candidate.decl.start) === JSON.stringify(fn.decl.start),
    );
    if (exactDeclaration.length === 1) {
      fn.loc = exactDeclaration[0].loc;
      fn.decl = exactDeclaration[0].decl;
      continue;
    }
    const namedDeclaration = originals.filter(
      (candidate) => candidate.name === fn.name && candidate.decl.start.line === fn.decl.start.line,
    );
    if (!fn.name.startsWith('(anonymous') && namedDeclaration.length === 1) {
      fn.loc = namedDeclaration[0].loc;
      fn.decl = namedDeclaration[0].decl;
      continue;
    }
    const fullRange = (candidate) => ({ start: candidate.decl.start, end: candidate.loc.end });
    const inside = (point, range) => point.column != null && before(range.start, point) && before(point, range.end);
    const overlaps = originals.filter(
      (candidate) => inside(fn.loc.start, fullRange(candidate)) || inside(fn.loc.end, fullRange(candidate)),
    );
    const innermost = overlaps.filter(
      (candidate) => !overlaps.some((other) => other !== candidate && contains(fullRange(candidate), fullRange(other))),
    );
    if (innermost.length === 1) {
      fn.loc = innermost[0].loc;
      fn.decl = innermost[0].decl;
      continue;
    }
    if (fn.loc.end.column != null) continue;
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
    if (matches.length !== 1) throw new Error(`Ambiguous source mapping for ${fn.name}`);
    fn.loc = matches[0].loc;
    fn.decl = matches[0].decl;
  }
}

export function ownedFiles(root, tracked) {
  const projects = tracked
    .filter((file) => /(^|\/)project\.json$/.test(file))
    .map((file) => path.dirname(file))
    .filter((directory) => directory !== '.')
    .sort((a, b) => b.length - a.length);
  return tracked.filter((file) => (projects.find((directory) => file.startsWith(`${directory}/`)) ?? '.') === root);
}

export function nodeCoverage(files, tests, output) {
  if (!tests.length) return [];
  mkdirSync(output, { recursive: true });
  const manifest = path.join(output, 'manifest.json');
  writeFileSync(manifest, JSON.stringify({ files: files.map((file) => path.resolve(workspace, file)), output }));
  const loader = path.join(workspace, 'scripts/crap-score/node-coverage.mjs');
  const env = {
    ...process.env,
    CRAP_NODE_MANIFEST: manifest,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${loader}`,
  };
  delete env.NODE_TEST_CONTEXT;
  execFileSync(process.execPath, ['--test', ...tests], {
    cwd: workspace,
    stdio: 'inherit',
    env,
  });
  const reports = readdirSync(output).filter((file) => file !== 'manifest.json' && file.endsWith('.json'));
  if (!reports.length) throw new Error('Node test runner did not produce coverage');
  return reports.map((file) => JSON.parse(readFileSync(path.join(output, file), 'utf8')));
}

const vitestSuites = {
  '.': [{ cwd: workspace, args: ['--config', 'scripts/crap-score/vitest.config.mts'] }],
  'apps/companion': [{ cwd: workspace, args: ['--config', 'apps/companion/renderer/vitest.config.mts'] }],
  'apps/frontend': [{ cwd: workspace, args: ['--config', 'apps/frontend/vitest.config.ts'] }],
  'apps/plugins/wago': [
    { cwd: workspace, args: ['--config', 'apps/plugins/wago/frontend/vitest.config.mts'] },
    { cwd: workspace, args: ['--config', 'apps/plugins/wago/frontend/vitest.config.ts'] },
  ],
  'apps/plugins/rabbitmq': [{ cwd: workspace, args: ['--config', 'apps/plugins/rabbitmq/frontend/vitest.config.ts'] }],
  'apps/plugins/shelly': [{ cwd: path.join(workspace, 'apps/plugins/shelly'), args: ['--root', 'frontend'] }],
  ...Object.fromEntries(
    [
      'libs/attractap-hw-shared',
      'libs/plugins-frontend-sdk',
      'libs/plugins-frontend-ui',
      'libs/companion-ws-client',
    ].map((root) => [root, [{ cwd: path.join(workspace, root), args: [] }]]),
  ),
};

function jestSuite(config) {
  return {
    runner: 'jest',
    cwd: workspace,
    args: ['--config', config, '--runInBand', '--passWithNoTests', '--testPathIgnorePatterns=\\.e2e\\.spec\\.ts$'],
  };
}

export function suites(root) {
  const result = (vitestSuites[root] ?? []).map((suite) => ({ runner: 'vitest', ...suite }));
  const config = ['jest.config.ts', 'jest.config.js'].find((file) => existsSync(path.join(root, file)));
  if (root !== '.' && config) result.unshift(jestSuite(path.join(root, config)));
  if (root === 'apps/plugins/wago') {
    result.push(
      ...['audit-hooks', 'commissioning'].map((name) => jestSuite(`${root}/scripts/jest.${name}.config.cjs`)),
    );
  }
  return result;
}

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
    limit: CRAP_SCORE_LIMIT,
    files: files.length,
    sourceFiles: files.map((file) => path.resolve(workspace, file)),
    ...summarizeScores(functions),
  };
  writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  enforceScores(project.name, report);
  console.log(
    `CRAP ${project.name}: ${summary.functions} functions, max ${summary.max.toFixed(2)} (limit ${CRAP_SCORE_LIMIT}). Reports: ${path.relative(workspace, output)}`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await run(process.argv[2] ?? '.');
}
