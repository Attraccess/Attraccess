import { execFileSync } from 'node:child_process';

export function stableVersion(value, description) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`${description} must contain a stable major.minor.patch version`);
  }
  return value.split('.').map(BigInt);
}

/**
 * Check committed changes against the common ancestor, independently of the working tree.
 *
 * `inspectChanges` is optional and only runs when no changed path matched `isSource`. It receives
 * `{ ancestor, paths }` (all changed paths) and returns `{ reasons: string[], message?: string }`: any reason makes the
 * change count as source, otherwise `message` (if given) replaces the default "no changes" result.
 */
export function checkReleaseVersion({ base, versionFile, isSource, readVersion, label, inspectChanges }) {
  // Large files exceed execFileSync's 1 MiB default, which would make `git show` fail.
  const git = (...args) =>
    execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
  const ancestor = git('merge-base', base, 'HEAD').trim();
  // Only a file that does not exist at `rev` reads as null; any other git failure must surface, not look unchanged.
  // `--full-tree` keeps paths relative to the repository root, like `rev:path`, even when run from a subdirectory.
  const show = (rev, path) =>
    git('ls-tree', '--full-tree', '--name-only', rev, '--', path).trim() ? git('show', `${rev}:${path}`) : null;
  const paths = git('diff', '--name-only', '-z', `${ancestor}...HEAD`, '--').split('\0').filter(Boolean);
  const changed = paths.filter(isSource);
  let unchangedMessage;
  if (!changed.length && inspectChanges) {
    const { reasons, message } = inspectChanges({ ancestor, paths });
    changed.push(...reasons);
    unchangedMessage = message;
  }
  const current = stableVersion(readVersion(git('show', `HEAD:${versionFile}`)), versionFile);
  if (!changed.length) return unchangedMessage ?? `No ${label} source changes detected.`;
  const previousText = show(ancestor, versionFile);
  if (previousText === null) return `Initial ${label} version established.`;
  const previous = stableVersion(readVersion(previousText), versionFile);
  const firstDifference = current.findIndex((part, index) => part !== previous[index]);
  if (firstDifference < 0 || current[firstDifference] < previous[firstDifference]) {
    throw new Error(`${label} source changed without increasing the version in ${versionFile}.\n${changed.join('\n')}`);
  }
  return `${label} source changed and the version was increased.`;
}
