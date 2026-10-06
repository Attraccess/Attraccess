#!/usr/bin/env node
// Like the Attractap firmware gate, compare the PR/merge queue with its base.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const manifestPath = 'apps/plugins/wago/cc100-runtime/manifest.json';

export function isRuntimeSource(path) {
  if (/\.(?:md|spec\.tsx?|test\.mjs)$/.test(path)) return false;
  if (/^apps\/plugins\/wago\/cc100-runtime\/(?:integration\/|.*simulator)/.test(path)) return false;
  return (
    ['apps/plugins/wago/cc100-runtime/', 'apps/plugins/wago/shared/', 'apps/plugins/wago/modbus/'].some((prefix) =>
      path.startsWith(prefix),
    ) ||
    [
      'apps/plugins/wago/project.json',
      'apps/plugins/wago/channel-behavior.ts',
      'apps/plugins/wago/measurement-contract.ts',
      'apps/plugins/wago/backend/protocol.ts',
      'apps/plugins/wago/backend/wago-hardware-deployment.ts',
      'apps/plugins/wago/backend/wago-host-io-guard.ts',
      'apps/plugins/wago/backend/wago-runtime-supervisor.ts',
      'apps/plugins/wago/backend/wago-runtime-install.ts',
      'apps/plugins/wago/backend/wago-runtime-update-shell.ts',
      'apps/plugins/wago/scripts/build-owned-runtime.mjs',
      'apps/plugins/wago/scripts/package-runtime-artifact.mjs',
      'apps/plugins/wago/scripts/docker-image-identity.mjs',
      '.github/actions/build-cc100-runtime/action.yml',
      '.github/workflows/wago-cc100-runtime.yml',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'nx.json',
      'tsconfig.base.json',
      '.npmrc',
      '.nvmrc',
      '.dockerignore',
    ].includes(path) ||
    path.startsWith('patches/')
  );
}

function version(manifest) {
  const value = JSON.parse(manifest).runtimeVersion;
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value))
    throw new Error(`${manifestPath} must contain a stable major.minor.patch runtimeVersion`);
  return value.split('.').map(BigInt);
}

export function checkRuntimeVersion(base = process.env.NX_AFFECTED_BASE ?? 'origin/main') {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const ancestor = git('merge-base', base, 'HEAD');
  const changed = git('diff', '--name-only', `${ancestor}...HEAD`, '--').split('\n').filter(isRuntimeSource);
  const current = version(git('show', `HEAD:${manifestPath}`));
  if (!changed.length) return 'No WAGO CC100 runtime source changes detected.';
  // The first addition of a runtime manifest establishes the initial version.
  if (!git('ls-tree', '--name-only', ancestor, '--', manifestPath)) return 'Initial CC100 runtime version established.';
  const previous = version(git('show', `${ancestor}:${manifestPath}`));
  const firstDifference = current.findIndex((part, index) => part !== previous[index]);
  if (firstDifference < 0 || current[firstDifference] < previous[firstDifference])
    throw new Error(
      `CC100 runtime source changed without increasing runtimeVersion in ${manifestPath}.\n${changed.join('\n')}`,
    );
  return 'WAGO CC100 runtime source changed and runtimeVersion was increased.';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(checkRuntimeVersion(process.argv[2]));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
