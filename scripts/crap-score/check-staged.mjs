import { execFileSync } from 'node:child_process';

/* eslint-disable no-console -- pre-commit diagnostics are intentional. */

const names = (args) =>
  execFileSync('git', args, { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
const unstaged = names(['diff', '--name-only', '-z']);
const generatedCache = (file) =>
  /^(?:\.nx-cache|\.nx-workspace-data|\.electron-cache|\.npm-cache)(?:\/|$)/.test(file);
const affectsCrap = (file) =>
  !generatedCache(file) &&
  (/\.[cm]?[jt]sx?$/.test(file) ||
    /(^|\/)(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|nx\.json|project\.json|tsconfig(?:\.[^/]+)?\.json|(?:jest\.preset|(?:jest|vitest|vite)\.config|babel\.config)\.[cm]?[jt]sx?|test-setup\.[cm]?[jt]sx?)$/.test(
      file,
    ) ||
    /(^|\/)(?:\.swcrc|\.babelrc(?:\.[^/]+)?)$/.test(file));
const unstagedSources = unstaged.filter(affectsCrap);
const untrackedSources = names(['ls-files', '--others', '--exclude-standard', '-z']).filter(affectsCrap);

if (unstagedSources.length || untrackedSources.length) {
  console.error(
    [
      'CRAP commit validation cannot verify the staged snapshot while source, tests, or analysis configuration differ in the worktree.',
      ...(unstagedSources.length ? [`Unstaged relevant paths: ${unstagedSources.join(', ')}`] : []),
      ...(untrackedSources.length ? [`Untracked relevant paths: ${untrackedSources.join(', ')}`] : []),
      'Stage or discard those changes, then retry the commit.',
    ].join('\n'),
  );
  process.exitCode = 1;
}
