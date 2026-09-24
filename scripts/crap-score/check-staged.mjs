import { execFileSync } from 'node:child_process';

/* eslint-disable no-console -- pre-commit diagnostics are intentional. */

const names = (args) =>
  execFileSync('git', args, { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
const unstaged = names(['diff', '--name-only', '-z']);
const unstagedSources = unstaged.filter((file) => /\.[cm]?[jt]sx?$/.test(file));
const untrackedSources = names(['ls-files', '--others', '--exclude-standard', '-z']).filter((file) =>
  /\.[cm]?[jt]sx?$/.test(file),
);

if (unstagedSources.length || untrackedSources.length) {
  console.error(
    [
      'CRAP commit validation cannot verify the staged snapshot while JS/TS source or tests differ in the worktree.',
      ...(unstagedSources.length ? [`Unstaged JS/TS paths: ${unstagedSources.join(', ')}`] : []),
      ...(untrackedSources.length ? [`Untracked JS/TS paths: ${untrackedSources.join(', ')}`] : []),
      'Stage or discard those changes, then retry the commit.',
    ].join('\n'),
  );
  process.exitCode = 1;
}
