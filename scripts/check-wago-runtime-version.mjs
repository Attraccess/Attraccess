#!/usr/bin/env node
/* eslint-disable no-console -- Release gate diagnostics are intentional. */
// Like the Attractap firmware gate, compare the PR/merge queue with its base.
import { checkReleaseVersion } from './lib/release-version.mjs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const manifestPath = 'apps/plugins/wago/cc100-runtime/manifest.json';
const dockerfilePath = 'apps/plugins/wago/cc100-runtime/Dockerfile';
const distPath = 'dist/apps/wago-cc100-runtime';
const placeholderVersion = '0.0.0';
const docsOrTests = /\.(?:md|spec\.tsx?|test\.mjs)$/;

// WAGO-internal paths: any change needs a bump without building, including host-side deployment code that is not
// part of the bundle (a deployment change only rolls out together with a new runtimeVersion).
export function isRuntimeSource(path) {
  if (docsOrTests.test(path)) return false;
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
    ].includes(path)
  );
}

// Files outside the WAGO plugin that can change the bundle: dependency resolution (package.json, lockfile,
// workspace settings, .npmrc, pnpmfile, patches) and compiler/build configuration (tsconfig.base.json is extended by
// the runtime tsconfig, nx.json configures the esbuild executor). Anything else under apps/plugins/wago/ may be
// imported by the bundle too, except docs and specs.
const buildInputs = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.npmrc',
  '.pnpmfile.cjs',
  '.pnpmfile.mjs',
  'tsconfig.base.json',
  'nx.json',
]);

export function isBuildCandidate(path) {
  if (buildInputs.has(path) || path.startsWith('patches/')) return true;
  return path.startsWith('apps/plugins/wago/') && !docsOrTests.test(path);
}

/* ---- Built-output comparison ---- */

// esbuild prefixes every bundled module with a `// <path>` comment and names CommonJS modules by their path, e.g.
// `"node_modules/.pnpm/debug@4.4.3_supports-color@7.2.0/node_modules/debug/src/node.js"(exports, module) {`. Store
// directory names carry the version and a peer-dependency suffix, which can change without the code changing.
const pathComment = /^\/\/ (?:node_modules|apps)\/\S+$/;
const storeDirectory = /node_modules\/\.pnpm\/[^/"'\s]+\/node_modules\//g;

export function normalizeBundle(text) {
  return text
    .split('\n')
    .filter((line) => !pathComment.test(line))
    .join('\n')
    .replace(storeDirectory, 'node_modules/');
}

function listFiles(directory, root = directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path, root) : [relative(root, path).split('\\').join('/')];
  });
}

/**
 * Snapshot of what ships, from a built checkout: repository path -> normalised content, for the dist files, the
 * Dockerfile and the manifest without `runtimeVersion`.
 */
export function readShippedRuntime(checkout) {
  const shipped = new Map();
  const dist = join(checkout, distPath);
  for (const file of listFiles(dist)) {
    const content = readFileSync(join(dist, file));
    shipped.set(`${distPath}/${file}`, /\.c?js$/.test(file) ? normalizeBundle(content.toString('utf8')) : content);
  }
  shipped.set(dockerfilePath, readFileSync(join(checkout, dockerfilePath)));
  const manifest = JSON.parse(readFileSync(join(checkout, manifestPath), 'utf8'));
  delete manifest.runtimeVersion;
  shipped.set(`${manifestPath} (without runtimeVersion)`, JSON.stringify(manifest));
  return shipped;
}

const byPath = ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0);

/** Per-file digests (sorted by path) and the overall hash over paths and digests. */
function digestShippedRuntime(shipped) {
  const files = new Map(
    [...shipped].sort(byPath).map(([path, content]) => [path, createHash('sha256').update(content).digest('hex')]),
  );
  const hash = createHash('sha256');
  for (const [path, fileDigest] of files) hash.update(`${path}\0${fileDigest}\n`);
  return { files, hash: hash.digest('hex') };
}

export const hashShippedRuntime = (shipped) => digestShippedRuntime(shipped).hash;

// Last lines of a failed command, without colour codes, blank lines and the noise Nx 24 plugins print while loading
// vite configs, which would otherwise push the actual error out of the tail.
const noise =
  /Your Vite config uses features|VITE_CONFIG_NATIVE_IGNORE_WARNING|^\s+- .*\(\S+\.(?:ts|mjs|cjs):\d+:\d+\)/;

export function failureTail(output, lines = 20) {
  return output
    .replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '')
    .split('\n')
    .filter((line) => line.trim() && !noise.test(line))
    .slice(-lines)
    .join('\n');
}

// No Nx Cloud, no self-hosted remote cache (it would also be written to) and no daemon. Husky hooks and the Electron
// binary are not needed to build the runtime.
function buildEnv() {
  const env = {
    ...process.env,
    NX_NO_CLOUD: 'true',
    NX_SKIP_REMOTE_CACHE: 'true',
    NX_DAEMON: 'false',
    CI: 'true',
    HUSKY: '0',
    ELECTRON_SKIP_BINARY_DOWNLOAD: '1',
  };
  delete env.NX_SELF_HOSTED_REMOTE_CACHE_SERVER;
  delete env.NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN;
  return env;
}

function run(command, args, cwd) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024,
      env: buildEnv(),
    });
  } catch (error) {
    const output = failureTail(`${error.stdout ?? ''}${error.stderr ?? ''}`);
    throw new Error(`${command} ${args.join(' ')} failed${output ? `:\n${output}` : `: ${error.message}`}`);
  }
}

/** Build the runtime of `rev` in a separate checkout, with a fixed runtimeVersion and without the Nx cache. */
export function buildRuntimeAt(rev) {
  const parent = mkdtempSync(join(tmpdir(), 'cc100-runtime-gate-'));
  const checkout = join(parent, 'checkout');
  try {
    run('git', ['worktree', 'add', '--detach', '--quiet', checkout, rev]);
    const manifestFile = join(checkout, manifestPath);
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    writeFileSync(manifestFile, `${JSON.stringify({ ...manifest, runtimeVersion: placeholderVersion }, null, 2)}\n`);
    run('pnpm', ['install', '--frozen-lockfile'], checkout);
    run(
      'pnpm',
      [
        'nx',
        'run',
        'plugin-wago:build-cc100-runtime',
        '--skip-nx-cache',
        // Inline the failed task's log; the default only points at a cache file that does not exist in CI.
        '--output-style=static',
      ],
      checkout,
    );
    return readShippedRuntime(checkout);
  } finally {
    try {
      run('git', ['worktree', 'remove', '--force', checkout]);
    } catch {
      /* the temporary directory is removed below either way */
    }
    rmSync(parent, { recursive: true, force: true });
  }
}

const listed = (items, limit = 10) =>
  items.length > limit ? [...items.slice(0, limit), `… and ${items.length - limit} more`] : items;

/** Null when both builds ship the same runtime, otherwise the hash change and the changed files. */
export function describeBuiltChange(base, head) {
  const [before, after] = [digestShippedRuntime(base), digestShippedRuntime(head)];
  if (before.hash === after.hash) return null;
  const files = [...new Set([...before.files.keys(), ...after.files.keys()])]
    .filter((file) => before.files.get(file) !== after.files.get(file))
    .sort();
  return [
    `Built WAGO CC100 runtime changed (hash ${before.hash.slice(0, 12)} → ${after.hash.slice(0, 12)}). Changed shipped files:`,
    ...listed(files).map((file) => `  ${file}`),
  ].join('\n');
}

export function checkRuntimeVersion(
  base = process.env.NX_AFFECTED_BASE ?? 'origin/main',
  { build = buildRuntimeAt, log = (line) => console.error(line) } = {},
) {
  return checkReleaseVersion({
    base,
    versionFile: manifestPath,
    isSource: isRuntimeSource,
    readVersion: (manifest) => JSON.parse(manifest).runtimeVersion,
    label: 'WAGO CC100 runtime',
    inspectChanges: ({ ancestor, paths }) => {
      const candidates = paths.filter(isBuildCandidate);
      if (!candidates.length) return { reasons: [] };
      log(`Comparing the built WAGO CC100 runtime because of: ${listed(candidates).join(', ')}`);
      const built = (side, rev) => {
        log(`Building the WAGO CC100 runtime at ${side} (${rev.slice(0, 12)})…`);
        try {
          return build(rev);
        } catch (error) {
          throw new Error(
            `Could not build the WAGO CC100 runtime at ${side} (${rev.slice(0, 12)}): ${error.message}\n` +
              `Fix the build, or increase runtimeVersion in ${manifestPath}: a version increase needs no comparison.`,
          );
        }
      };
      const before = built('merge-base', ancestor);
      const after = built('HEAD', 'HEAD');
      const change = describeBuiltChange(before, after);
      return change
        ? { reasons: [change] }
        : {
            reasons: [],
            message: `Built WAGO CC100 runtime is unchanged (hash ${hashShippedRuntime(after).slice(0, 12)}); no version increase required.`,
          };
    },
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
