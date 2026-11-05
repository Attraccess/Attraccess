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
 * `contentSources` is optional: a map of path -> `({ ancestor, show }) => string | null`. Those paths count as
 * source only when the callback returns a description of what changed (`show(rev, path)` reads a file from git,
 * or null when it does not exist at that revision). They are evaluated in addition to `isSource`, which stays path-only.
 */
export function checkReleaseVersion({ base, versionFile, isSource, readVersion, label, contentSources = {} }) {
  // Files such as pnpm-lock.yaml exceed execFileSync's 1 MiB default, which would make `git show` fail.
  const git = (...args) =>
    execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
  const ancestor = git('merge-base', base, 'HEAD').trim();
  // Only a file that does not exist at `rev` reads as null; any other git failure must surface, not look unchanged.
  const show = (rev, path) =>
    git('ls-tree', '--name-only', rev, '--', path).trim() ? git('show', `${rev}:${path}`) : null;
  const changed = git('diff', '--name-only', '-z', `${ancestor}...HEAD`, '--')
    .split('\0')
    .flatMap((path) => {
      if (isSource(path)) return [path];
      const detect = Object.hasOwn(contentSources, path) ? contentSources[path] : undefined;
      const detail = detect?.({ ancestor, show });
      return detail ? [`${path} (${detail})`] : [];
    });
  const current = stableVersion(readVersion(git('show', `HEAD:${versionFile}`)), versionFile);
  if (!changed.length) return `No ${label} source changes detected.`;
  if (!git('ls-tree', '--name-only', ancestor, '--', versionFile).trim())
    return `Initial ${label} version established.`;
  const previous = stableVersion(readVersion(git('show', `${ancestor}:${versionFile}`)), versionFile);
  const firstDifference = current.findIndex((part, index) => part !== previous[index]);
  if (firstDifference < 0 || current[firstDifference] < previous[firstDifference]) {
    throw new Error(`${label} source changed without increasing the version in ${versionFile}.\n${changed.join('\n')}`);
  }
  return `${label} source changed and the version was increased.`;
}
