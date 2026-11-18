/* eslint-disable no-console -- CLI diagnostics are intentional. */
// Lite typecheck for the pre-commit hook. It runs the `tsc` checks CI runs for the
// projects that own staged TypeScript files, with incremental build info, and skips
// Nx: no project graph and no code generation, so a repeat commit in the same project
// takes seconds. It reads the worktree, not the index, and does not check dependent
// projects; CI runs the full typecheck and build.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { generatedClients, git } from './lib/repo-files.mjs';

// Project root -> tsc arguments, as CI runs them: each project's `typecheck` and
// `typecheck-tests` targets, `@nx/js:tsc` builds, and the API's webpack build (which
// type-checks tsconfig.app.json). typecheck-staged.test.mjs compares it with Nx.
// The companion and its generated client stay excluded, as in the previous hook.
export const checks = {
  'apps/api': [['-p', 'apps/api/tsconfig.app.json']],
  'apps/frontend': [
    ['-p', 'apps/frontend/tsconfig.app.json'],
    ['-p', 'apps/frontend/tsconfig.spec.json'],
  ],
  'apps/matter-sidecar': [
    ['-p', 'apps/matter-sidecar/tsconfig.app.json'],
    ['-p', 'apps/matter-sidecar/tsconfig.spec.json'],
  ],
  'apps/plugins/matter': [
    ['-p', 'apps/plugins/matter/backend/tsconfig.json'],
    ['-p', 'apps/plugins/matter/frontend/tsconfig.json'],
    ['-p', 'apps/plugins/matter/tsconfig.spec.json'],
  ],
  'apps/plugins/reservations': [
    ['-p', 'apps/plugins/reservations/backend/tsconfig.json'],
    ['-p', 'apps/plugins/reservations/tsconfig.spec.json', '--module', 'esnext', '--moduleResolution', 'bundler'],
  ],
  'apps/plugins/wago': [
    ['-p', 'apps/plugins/wago/tsconfig.spec.json'],
    ['-p', 'apps/plugins/wago/acceptance/tsconfig.json'],
  ],
  'libs/api-client': [['-p', 'libs/api-client/tsconfig.lib.json']],
  'libs/application-models': [['-p', 'libs/application-models/tsconfig.lib.json']],
  'libs/database-entities': [['-p', 'libs/database-entities/tsconfig.lib.json']],
  'libs/env': [['-p', 'libs/env/tsconfig.lib.json']],
  'libs/matter-contract': [
    ['-p', 'libs/matter-contract/tsconfig.lib.json'],
    ['-p', 'libs/matter-contract/tsconfig.spec.json'],
  ],
  'libs/plugins-backend-sdk': [['-p', 'libs/plugins-backend-sdk/tsconfig.lib.json']],
  'libs/plugins-frontend-sdk': [['-p', 'libs/plugins-frontend-sdk/tsconfig.lib.json']],
  'libs/plugins-frontend-ui': [['-p', 'libs/plugins-frontend-ui/tsconfig.spec.json']],
  'libs/react-query-client': [['-p', 'libs/react-query-client/tsconfig.lib.json']],
  'libs/shared': [['-p', 'libs/shared/tsconfig.lib.json']],
  'libs/ui': [['-p', 'libs/ui/tsconfig.lib.json']],
  'tools/generators': [['-p', 'tools/generators/tsconfig.lib.json']],
};

const typescriptSource = /\.(?:[cm]?ts|tsx)$/;
// Generated clients most projects import. Without them every import reports as missing.
export const requiredGenerated = ['libs/react-query-client/src/lib', 'libs/api-client/src/generated'];
export const buildInfoDirectory = 'node_modules/.cache/precommit-typecheck';

export function projectFor(file) {
  if (!typescriptSource.test(file) || file.endsWith('.d.ts') || generatedClients.test(file)) return null;
  return Object.keys(checks).find((root) => file.startsWith(`${root}/`)) ?? null;
}

export function checksFor(files) {
  const projects = new Set(files.map(projectFor).filter(Boolean));
  return [...projects].sort().flatMap((project) => checks[project]);
}

export function buildInfoFor(args) {
  return path.posix.join(buildInfoDirectory, `${args[1].replaceAll('/', '__')}.tsbuildinfo`);
}

export function run({ files, exists, typecheck, log }) {
  const pending = checksFor(files);
  if (!pending.length) return 0;
  const missing = requiredGenerated.filter((directory) => !exists(directory));
  if (missing.length) {
    log(`Skipping typecheck: generated clients are missing (${missing.join(', ')}). CI runs it.`);
    return 0;
  }
  const failed = pending.filter((args) => !typecheck(args)).map((args) => args[1]);
  if (failed.length) {
    log(`Typecheck failed for ${failed.join(', ')}.`);
    return 1;
  }
  log(`Typecheck passed (${pending.map((args) => args[1]).join(', ')}).`);
  return 0;
}

function tsc(args) {
  mkdirSync(buildInfoDirectory, { recursive: true });
  const options = ['--noEmit', '--incremental', '--tsBuildInfoFile', buildInfoFor(args)];
  return spawnSync('node_modules/.bin/tsc', [...args, ...options], { stdio: 'inherit' }).status === 0;
}

if (import.meta.main) {
  process.exitCode = run({
    files: git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).split('\0').filter(Boolean),
    exists: existsSync,
    typecheck: tsc,
    log: console.error,
  });
}
