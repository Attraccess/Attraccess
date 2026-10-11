import { execFileSync } from 'node:child_process';

export function stableVersion(value, description) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`${description} must contain a stable major.minor.patch version`);
  }
  return value.split('.').map(BigInt);
}

/** Check committed changes against the common ancestor, independently of the working tree. */
export function checkReleaseVersion({ base, versionFile, isSource, readVersion, label }) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const ancestor = git('merge-base', base, 'HEAD').trim();
  const changed = git('diff', '--name-only', '-z', `${ancestor}...HEAD`, '--').split('\0').filter(isSource);
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
