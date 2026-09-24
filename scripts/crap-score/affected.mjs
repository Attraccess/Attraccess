/* eslint-disable no-console -- CLI progress and diagnostics are intentional. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workspace } from './run.mjs';

const exec = (command, args, options = {}) => execFileSync(command, args, { cwd: workspace, ...options });

export const isSharedChange = (files) =>
  files.some(
    (file) =>
      /^(scripts\/crap-score\/|nx\.json$|package\.json$|pnpm-lock\.yaml$|jest\.preset\.[cm]?[jt]s$|tsconfig(?:\.[^/]+)?\.json$)/.test(
        file,
      ) ||
      /(^|\/)(project\.json|vitest\.config\.[cm]?[jt]s|jest\.config\.[cm]?[jt]s|test-setup\.[cm]?[jt]s)$/.test(file) ||
      (/\.[cm]?[jt]sx?$/.test(file) && !/^(apps|libs|tools)\//.test(file)),
  );

export function verifyReports(projects, root = workspace) {
  for (const project of projects) {
    const directory = path.join(root, 'coverage/crap', project.replaceAll('/', '__'));
    const required = ['coverage-final.json', 'crap-report.json', 'summary.json', 'html/index.html'];
    for (const file of required) {
      const report = path.join(directory, file);
      if (!existsSync(report)) throw new Error(`Missing CRAP report for ${project}: ${path.relative(root, report)}`);
    }
    let summary;
    let coverage;
    let report;
    try {
      summary = JSON.parse(readFileSync(path.join(directory, 'summary.json'), 'utf8'));
      coverage = JSON.parse(readFileSync(path.join(directory, 'coverage-final.json'), 'utf8'));
      report = JSON.parse(readFileSync(path.join(directory, 'crap-report.json'), 'utf8'));
    } catch (error) {
      throw new Error(`Malformed CRAP report for ${project}: ${error.message}`);
    }
    if (
      summary.project !== project ||
      !Number.isInteger(summary.files) ||
      summary.files < 1 ||
      !Array.isArray(summary.sourceFiles) ||
      summary.sourceFiles.length !== summary.files
    )
      throw new Error(`Incomplete CRAP summary for ${project}`);
    if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage))
      throw new Error(`Malformed coverage report for ${project}`);
    if (!report || typeof report !== 'object' || Array.isArray(report))
      throw new Error(`Malformed analysis report for ${project}`);
    const expected = [...summary.sourceFiles].sort();
    if (JSON.stringify(Object.keys(coverage).sort()) !== JSON.stringify(expected))
      throw new Error(`Incomplete coverage report for ${project}: expected ${expected.length} source files`);
    if (JSON.stringify(Object.keys(report).sort()) !== JSON.stringify(expected))
      throw new Error(`Incomplete analysis report for ${project}: expected ${expected.length} source files`);
  }
}

export function selectProjects(args, changedFiles) {
  const all = JSON.parse(exec('pnpm', ['exec', 'nx', 'show', 'projects', '--withTarget=crap-score', '--json'], { encoding: 'utf8' }));
  if (args.includes('--all') || isSharedChange(changedFiles)) return all.sort();
  const base = args.find((arg) => arg.startsWith('--base='))?.slice('--base='.length);
  const head = args.find((arg) => arg.startsWith('--head='))?.slice('--head='.length);
  const selection = args.includes('--uncommitted')
    ? ['--uncommitted']
    : base
      ? [`--base=${base}`, `--head=${head ?? 'HEAD'}`]
      : ['--uncommitted'];
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
  exec('pnpm', ['exec', 'nx', 'run-many', '--target=crap-score', `--projects=${projects.join(',')}`, '--parallel=2'], {
    stdio: 'inherit',
  });
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
