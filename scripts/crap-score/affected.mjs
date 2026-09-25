/* eslint-disable no-console -- CLI progress and diagnostics are intentional. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CRAP_SCORE_LIMIT, enforceScores, isSource, ownedFiles, workspace } from './run.mjs';

const exec = (command, args, options = {}) => execFileSync(command, args, { cwd: workspace, ...options });

export const isSharedChange = (files) =>
  files.some(
    (file) =>
      /^(scripts\/crap-score\/|nx\.json$|package\.json$|pnpm-lock\.yaml$|jest\.preset\.[cm]?[jt]s$|tsconfig(?:\.[^/]+)?\.json$)/.test(
        file,
      ) ||
      /(^|\/)(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|project\.json|nx\.json|tsconfig(?:\.[^/]+)?\.json|jest\.preset\.[cm]?[jt]s|vitest\.config\.[cm]?[jt]s|jest\.config\.[cm]?[jt]s|test-setup\.[cm]?[jt]s)$/.test(
        file,
      ) ||
      /(^|\/)(?:\.swcrc|\.babelrc(?:\.[^/]+)?|babel\.config\.[cm]?[jt]s|(?:jest|vitest|vite)\.config\.[cm]?[jt]s)$/.test(file) ||
      (/\.[cm]?[jt]sx?$/.test(file) && !/^(apps|libs|tools)\//.test(file)),
  );

const absoluteReportPath = (file, root, expectedFiles) => {
  if (path.isAbsolute(file)) return path.normalize(file);
  const direct = path.resolve(root, file);
  if (!expectedFiles || expectedFiles.has(direct)) return direct;
  const matches = [...expectedFiles].filter((expected) => path.relative(root, expected).endsWith(`/${file}`));
  return matches.length === 1 ? matches[0] : direct;
};

function validCoverageEntry(file, coverage, root, expectedFiles) {
  if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) return false;
  if (typeof coverage.path !== 'string' || absoluteReportPath(coverage.path, root, expectedFiles) !== file) return false;
  for (const [map, counts] of [
    ['statementMap', 's'],
    ['fnMap', 'f'],
    ['branchMap', 'b'],
  ]) {
    if (!coverage[map] || typeof coverage[map] !== 'object' || Array.isArray(coverage[map])) return false;
    if (!coverage[counts] || typeof coverage[counts] !== 'object' || Array.isArray(coverage[counts])) return false;
    if (
      Object.keys(coverage[map]).length !== Object.keys(coverage[counts]).length ||
      Object.keys(coverage[map]).some((key) => !(key in coverage[counts]) || !coverage[map][key] || typeof coverage[map][key] !== 'object')
    )
      return false;
    if (
      Object.values(coverage[counts]).some((value) =>
        Array.isArray(value)
          ? value.some((count) => !Number.isFinite(count) || count < 0)
          : !Number.isFinite(value) || value < 0,
      )
    )
      return false;
  }
  return true;
}

export function projectSourceManifest(projects, tracked, root) {
  const actualSources = new Map();
  const projectRoots = new Map();
  for (const file of tracked.filter((file) => /(^|\/)project\.json$/.test(file))) {
    const config = JSON.parse(readFileSync(path.join(root, file), 'utf8'));
    if (config.name) projectRoots.set(config.name, config.root ?? path.dirname(file));
  }
  for (const project of projects) {
    const projectRoot = projectRoots.get(project);
    if (!projectRoot) throw new Error(`Missing Nx project configuration for ${project}`);
    actualSources.set(
      project,
      ownedFiles(projectRoot, tracked).filter(isSource).map((file) => path.resolve(root, file)).sort(),
    );
  }
  return actualSources;
}

function readProjectReports(project, root) {
  const directory = path.join(root, 'coverage/crap', project.replaceAll('/', '__'));
  for (const file of ['coverage-final.json', 'crap-report.json', 'summary.json', 'html/index.html']) {
    const reportPath = path.join(directory, file);
    if (!existsSync(reportPath)) throw new Error(`Missing CRAP report for ${project}: ${path.relative(root, reportPath)}`);
  }
  try {
    return {
      summary: JSON.parse(readFileSync(path.join(directory, 'summary.json'), 'utf8')),
      coverage: JSON.parse(readFileSync(path.join(directory, 'coverage-final.json'), 'utf8')),
      report: JSON.parse(readFileSync(path.join(directory, 'crap-report.json'), 'utf8')),
    };
  } catch (error) {
    throw new Error(`Malformed CRAP report for ${project}: ${error.message}`);
  }
}

function validateSummary(project, summary) {
  if (
    summary?.project !== project ||
    !Number.isInteger(summary.files) || summary.files < 1 ||
    !Array.isArray(summary.sourceFiles) || summary.sourceFiles.length !== summary.files ||
    new Set(summary.sourceFiles).size !== summary.files || summary.sourceFiles.some((file) => typeof file !== 'string') ||
    !Number.isInteger(summary.functions) || summary.functions < 0 || summary.limit !== CRAP_SCORE_LIMIT ||
    !Number.isInteger(summary.violations) || summary.violations < 0 ||
    !Number.isFinite(summary.max) || summary.max < 0
  ) throw new Error(`Incomplete CRAP summary for ${project}`);
}

function normalizedEntries(project, report, expected, root, kind) {
  if (!report || typeof report !== 'object' || Array.isArray(report))
    throw new Error(`Malformed ${kind} report for ${project}`);
  const expectedFiles = new Set(expected);
  const entries = Object.entries(report).map(([file, data]) => [absoluteReportPath(file, root, expectedFiles), data]);
  const paths = entries.map(([file]) => file).sort();
  if (new Set(paths).size !== paths.length || JSON.stringify(paths) !== JSON.stringify(expected))
    throw new Error(`Incomplete ${kind} report for ${project}: expected ${expected.length} source files`);
  return entries;
}

function validateProjectReport(project, root, currentSources) {
  const { summary, coverage, report } = readProjectReports(project, root);
  validateSummary(project, summary);
  const expected = summary.sourceFiles.map((file) => absoluteReportPath(file, root)).sort();
  if (currentSources && JSON.stringify(expected) !== JSON.stringify(currentSources))
    throw new Error(`Incomplete source manifest for ${project}: expected ${currentSources.length} current source files`);
  const coverageEntries = normalizedEntries(project, coverage, expected, root, 'coverage');
  if (coverageEntries.some(([file, data]) => !validCoverageEntry(file, data, root, new Set(expected))))
    throw new Error(`Malformed coverage data for ${project}`);
  const reportEntries = normalizedEntries(project, report, expected, root, 'analysis');
  if (reportEntries.some(([, functions]) => !functions || typeof functions !== 'object' || Array.isArray(functions)))
    throw new Error(`Malformed function data for ${project}`);
  const normalizedReport = Object.fromEntries(reportEntries);
  const functions = Object.values(normalizedReport).flatMap((file) => Object.values(file));
  const coverageFunctions = coverageEntries.reduce((count, [, file]) => count + Object.keys(file.fnMap).length, 0);
  if (functions.length !== summary.functions || functions.length !== coverageFunctions)
    throw new Error(`Incomplete function analysis for ${project}: coverage has ${coverageFunctions}, report has ${functions.length}`);
  const violations = functions.filter((fn) => fn?.statements?.crap > CRAP_SCORE_LIMIT).length;
  const max = Math.max(0, ...functions.map((fn) => fn?.statements?.crap));
  if (summary.violations !== violations || summary.max !== max)
    throw new Error(`Inconsistent CRAP summary for ${project}: expected ${violations} violation(s), max ${max}`);
  enforceScores(project, normalizedReport);
}

export function verifyReports(projects, root = workspace) {
  const tracked = root === workspace
    ? exec('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
    : null;
  const actualSources = tracked ? projectSourceManifest(projects, tracked, root) : new Map();
  for (const project of projects) validateProjectReport(project, root, actualSources.get(project));
}

export function affectedSelection(args, sharedChange) {
  if (args.includes('--all') || sharedChange) return null;
  const base = args.find((arg) => arg.startsWith('--base='))?.slice('--base='.length);
  const head = args.find((arg) => arg.startsWith('--head='))?.slice('--head='.length);
  if (args.includes('--uncommitted') || !base) return ['--uncommitted'];
  return [`--base=${base}`, `--head=${head ?? 'HEAD'}`];
}

export function selectProjects(args, changedFiles) {
  const all = JSON.parse(exec('pnpm', ['exec', 'nx', 'show', 'projects', '--withTarget=crap-score', '--json'], { encoding: 'utf8' }));
  const selection = affectedSelection(args, isSharedChange(changedFiles));
  if (selection === null) return all.sort();
  return JSON.parse(
    exec('pnpm', ['exec', 'nx', 'show', 'projects', '--affected', ...selection, '--withTarget=crap-score', '--json'], {
      encoding: 'utf8',
    }),
  ).sort();
}

export function enforceProjects(projects) {
  if (!projects.length) {
    console.log('No affected projects have a crap-score target.');
    return;
  }
  // A cache hit restores this output from Nx. Clearing old outputs first makes
  // an omitted task or an early analysis failure distinguishable from reports
  // left by a previous invocation.
  for (const project of projects) {
    rmSync(path.join(workspace, 'coverage/crap', project.replaceAll('/', '__')), { recursive: true, force: true });
  }
  try {
    exec('pnpm', ['exec', 'nx', 'run-many', '--target=crap-score', `--projects=${projects.join(',')}`, '--parallel=2'], {
      stdio: 'inherit',
    });
  } catch (error) {
    // Nx stops on an analysis/threshold error. Validate every report it did
    // produce first, while preserving Nx's original failure if validation also
    // finds missing or incomplete output.
    try {
      verifyReports(projects);
    } catch (reportError) {
      console.error(reportError.message);
    }
    throw error;
  }
  verifyReports(projects);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const changedFiles = args.includes('--uncommitted')
    ? exec('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8' }).split('\n').filter(Boolean).concat(
        exec('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\n').filter(Boolean),
      )
    : args.some((arg) => arg.startsWith('--base='))
      ? exec('git', ['diff', '--name-only', `${args.find((arg) => arg.startsWith('--base=')).slice(7)}...HEAD`], {
          encoding: 'utf8',
        }).split('\n').filter(Boolean)
      : [];
  enforceProjects(selectProjects(args, changedFiles));
}
