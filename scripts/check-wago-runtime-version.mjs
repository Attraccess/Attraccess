#!/usr/bin/env node
/* eslint-disable no-console -- Release gate diagnostics are intentional. */
// Like the Attractap firmware gate, compare the PR/merge queue with its base.
import { checkReleaseVersion } from './lib/release-version.mjs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { runtimeDependencies } from './lib/wago-runtime-dependencies.mjs';

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
      'apps/plugins/wago/backend/protocol/index.ts',
      'apps/plugins/wago/backend/host/hardware-deployment.ts',
      'apps/plugins/wago/backend/host/host-io-guard.ts',
      'apps/plugins/wago/backend/runtime/supervisor.ts',
      'apps/plugins/wago/backend/runtime/install.ts',
      'apps/plugins/wago/backend/runtime/update/shell.ts',
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

export function checkRuntimeVersion(base = process.env.NX_AFFECTED_BASE ?? 'origin/main') {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const ancestor = git('merge-base', base, 'HEAD').trim();
  // Validate both committed graphs before classifying files or accepting a bump.
  // Invalid unchanged records must also reject source-only and version-only edits.
  const dependenciesChanged = !isDeepStrictEqual(
    runtimeDependencies((file) => git('show', `${ancestor}:${file}`)),
    runtimeDependencies((file) => git('show', `HEAD:${file}`)),
  );
  const isSource = (path) => {
    if (!isRuntimeSource(path)) return false;
    if (!['package.json', 'pnpm-lock.yaml'].includes(path) && !path.startsWith('patches/')) return true;
    return dependenciesChanged;
  };
  return checkReleaseVersion({
    base,
    versionFile: manifestPath,
    isSource,
    readVersion: (manifest) => JSON.parse(manifest).runtimeVersion,
    label: 'WAGO CC100 runtime',
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(checkRuntimeVersion(process.argv[2]));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
