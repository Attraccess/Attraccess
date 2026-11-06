#!/usr/bin/env node
/* eslint-disable no-console -- Release gate diagnostics are intentional. */
// Like the Attractap firmware gate, compare the PR/merge queue with its base.
import { checkReleaseVersion } from './lib/release-version.mjs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

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
      'pnpm-workspace.yaml',
      'nx.json',
      'tsconfig.base.json',
      '.npmrc',
      '.nvmrc',
      '.dockerignore',
      '.pnpmfile.cjs',
      '.pnpmfile.mjs',
    ].includes(path) ||
    path.startsWith('patches/')
  );
}

/* ---- Content-aware rules for the root package.json and pnpm-lock.yaml ---- */

const runtimePackagePath = 'apps/plugins/wago/cc100-runtime/package.json';
const dependencySections = ['dependencies', 'devDependencies', 'optionalDependencies'];

function declaredRuntimeDependencies(...texts) {
  const names = new Set();
  for (const text of texts)
    if (text) for (const name of Object.keys(JSON.parse(text).dependencies ?? {})) names.add(name);
  return names;
}

/** Describe what changed in the root package.json that can alter the bundled runtime dependencies, or null. */
export function describePackageJsonChange(before, after, declared) {
  if (before === after) return null;
  const a = before === null ? null : JSON.parse(before);
  const b = after === null ? null : JSON.parse(after);
  if (!a || !b) return 'added or removed';
  const reasons = [];
  for (const section of dependencySections)
    for (const name of declared)
      if (a[section]?.[name] !== b[section]?.[name])
        reasons.push(`${section}.${name} ${a[section]?.[name] ?? '(none)'} → ${b[section]?.[name] ?? '(none)'}`);
  for (const field of ['overrides', 'patchedDependencies', 'packageExtensions']) {
    const [x, y] = [a.pnpm?.[field], b.pnpm?.[field]];
    if (isDeepStrictEqual(x, y)) continue;
    const keys = [...new Set([...Object.keys(x ?? {}), ...Object.keys(y ?? {})])].filter(
      (key) => !isDeepStrictEqual(x?.[key], y?.[key]),
    );
    reasons.push(keys.length ? `pnpm.${field} (${keys.sort().join(', ')})` : `pnpm.${field}`);
  }
  if (a.packageManager !== b.packageManager) {
    const short = (manager) => manager?.replace(/\+.*$/, '') ?? '(none)';
    const [from, to] =
      short(a.packageManager) === short(b.packageManager)
        ? [a, b].map((p) => p.packageManager)
        : [a, b].map((p) => short(p.packageManager));
    reasons.push(`packageManager ${from} → ${to}`);
  }
  return reasons.length ? `runtime dependency inputs changed: ${reasons.join(', ')}` : null;
}

// Only plain or single-line quoted scalars; block scalars, anchors, tags and flow collections (except `{}`) throw.
function scalar(raw, line) {
  if (/^['"]/.test(raw)) {
    const q = /^'((?:[^']|'')*)'$|^"([^"\\]*)"$/.exec(raw);
    if (!q) throw new Error(`unsupported quoted value: ${line.trim()}`);
    return q[1] !== undefined ? q[1].replaceAll("''", "'") : q[2];
  }
  if (/^[|>&*!{[]/.test(raw) && raw !== '{}') throw new Error(`unsupported value: ${line.trim()}`);
  return raw;
}

function splitEntry(line) {
  // Plain keys may contain `:` (e.g. `pkg@file:../pkg`, tarball URLs); only `:` before a space or the end ends them.
  const m = /^\s*(?:'((?:[^']|'')*)'|"([^"]*)"|([^\s'"].*?)):(?:\s+(.*?))?\s*$/.exec(line);
  if (!m) throw new Error(`unexpected lockfile line: ${line.trim()}`);
  return { key: m[1] !== undefined ? m[1].replaceAll("''", "'") : (m[2] ?? m[3]), value: scalar(m[4] ?? '', line) };
}

/**
 * Minimal reader for the pnpm v9 lockfile: the root importer's direct dependencies, the `snapshots` graph, the raw
 * `packages` entries (resolution, integrity) and the raw text of every other top-level section.
 * `importers` and `snapshots` must be plain block YAML as pnpm writes it; anything else throws so callers fail safe.
 */
export function parseLockfile(text) {
  if (!/^lockfileVersion: '?9\.0'?\s*$/m.test(text))
    throw new Error('unsupported or missing lockfileVersion (expected 9.0)');
  const importer = new Map(); // name -> version, for the root importer
  const snapshots = new Map(); // key -> "name=value" edges
  const packages = new Map(); // key -> raw entry text
  const sections = new Map(); // other top-level key -> raw text
  const add = (map, key, value) => {
    if (map.has(key)) throw new Error(`duplicate lockfile entry: ${key}`);
    map.set(key, value);
  };
  let top = null;
  let hasRoot = false;
  let inRoot = false;
  let section = null;
  let entry = null;
  let snapshot = null;
  let block = null; // [indent, value] of the previous structural line, so nesting can be checked
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      const { key, value } = splitEntry(line);
      top = key;
      if (!['importers', 'packages', 'snapshots'].includes(key)) add(sections, key, value);
      else if (value) throw new Error(`unsupported value: ${line.trim()}`);
      inRoot = false;
      section = entry = snapshot = null;
      block = [0, ''];
      continue;
    }
    if (top === 'packages') {
      if (indent === 2) {
        const { key, value } = splitEntry(line);
        add(packages, (entry = key), value);
      } else if (entry !== null) packages.set(entry, `${packages.get(entry)}\n${line.trimEnd()}`);
      else throw new Error(`unexpected indentation: ${line.trim()}`);
      continue;
    }
    if (top !== 'importers' && top !== 'snapshots') {
      sections.set(top, `${sections.get(top)}\n${line.trimEnd()}`);
      continue;
    }
    // Nesting must step in by two spaces below a key without a value; anything else (e.g. a multi-line scalar)
    // could be read differently by pnpm.
    if (indent > block[0] && (indent !== block[0] + 2 || block[1] !== ''))
      throw new Error(`unexpected indentation: ${line.trim()}`);
    if (line.trimStart().startsWith('- ')) {
      scalar(line.trim().slice(1).trim(), line);
      block = [indent, '-'];
      continue;
    }
    const { key, value } = splitEntry(line);
    block = [indent, value];
    if (top === 'importers') {
      if (indent === 2) {
        inRoot = key === '.';
        hasRoot ||= inRoot;
      } else if (inRoot && indent === 4) {
        section = key;
        entry = null;
      } else if (inRoot && indent === 6 && dependencySections.includes(section)) entry = key;
      else if (inRoot && indent === 8 && entry !== null && dependencySections.includes(section)) {
        if (key === 'version') add(importer, entry, value);
      }
    } else if (indent === 2) {
      snapshot = key;
      add(snapshots, snapshot, []);
      section = null;
    } else if (indent === 4) section = key;
    else if (indent === 6 && (section === 'dependencies' || section === 'optionalDependencies'))
      snapshots.get(snapshot).push(`${key}=${value}`);
  }
  if (!hasRoot) throw new Error('root importer not found');
  if (!snapshots.size) throw new Error('no snapshots section found');
  return { importer, snapshots, packages, sections };
}

// An edge resolves to `name@version`; for npm: aliases pnpm writes the target snapshot key as the version instead.
const snapshotKey = (snapshots, name, version) =>
  snapshots.has(`${name}@${version}`) ? `${name}@${version}` : version;

function packageOf(key) {
  const plain = key.replace(/\(.*$/, '');
  const at = plain.lastIndexOf('@');
  return at > 0 ? { name: plain.slice(0, at), version: plain.slice(at + 1) } : { name: plain, version: '' };
}

// Type-only packages are never bundled.
const typeOnly = (key) => packageOf(key).name.startsWith('@types/');

/**
 * Resolved closure of the given root dependencies: `roots` (name -> root importer version) and `packages`
 * (snapshot key -> its dependency edges and raw `packages` entry), leaving out type-only `@types/*` packages.
 */
export function runtimeClosure({ importer, snapshots, packages }, declared) {
  const roots = new Map();
  const closure = new Map();
  const queue = [];
  for (const name of [...declared].sort()) {
    const version = importer.get(name);
    if (version === undefined) throw new Error(`${name} is not a dependency of the root importer`);
    roots.set(name, version);
    queue.push([name, version]);
  }
  while (queue.length) {
    const [name, version] = queue.pop();
    if (version.startsWith('link:')) continue;
    const key = snapshotKey(snapshots, name, version);
    if (closure.has(key) || typeOnly(key)) continue;
    const edges = snapshots.get(key);
    if (!edges) throw new Error(`no snapshot for ${name}@${version}`);
    const entry = packages.get(key.replace(/\(.*$/, ''));
    if (entry === undefined) throw new Error(`no packages entry for ${key}`);
    const reached = edges
      .map((edge) => [edge.slice(0, edge.indexOf('=')), edge.slice(edge.indexOf('=') + 1)])
      .filter(([dependency, resolved]) => !typeOnly(snapshotKey(snapshots, dependency, resolved)));
    closure.set(key, {
      edges: reached
        .map(([dependency, resolved]) => `${dependency}=${resolved}`)
        .sort()
        .join('\n'),
      entry,
    });
    queue.push(...reached);
  }
  return { roots, packages: closure };
}

function describeClosureChange(before, after) {
  const byName = new Map();
  const entry = (name) =>
    byName.get(name) ?? byName.set(name, { old: new Set(), next: new Set(), changed: new Set() }).get(name);
  for (const name of new Set([...before.roots.keys(), ...after.roots.keys()])) {
    if (before.roots.get(name) === after.roots.get(name)) continue;
    if (before.roots.has(name)) entry(name).old.add(packageOf(`${name}@${before.roots.get(name)}`).version);
    if (after.roots.has(name)) entry(name).next.add(packageOf(`${name}@${after.roots.get(name)}`).version);
  }
  for (const key of new Set([...before.packages.keys(), ...after.packages.keys()])) {
    const [old, next] = [before.packages.get(key), after.packages.get(key)];
    const { name, version } = packageOf(key);
    if (old && next) {
      if (old.entry !== next.entry) entry(name).changed.add(`${version} (resolution changed)`);
      else if (old.edges !== next.edges) entry(name).changed.add(`${version} (dependencies changed)`);
    } else entry(name)[old ? 'old' : 'next'].add(version);
  }
  const roots = new Set([...before.roots.keys(), ...after.roots.keys()]);
  const parts = [...byName]
    .sort(([a], [b]) => Number(roots.has(b)) - Number(roots.has(a)) || (a < b ? -1 : a > b ? 1 : 0))
    .flatMap(([name, { old, next, changed }]) => {
      const [from, to] = [old, next].map((versions) => [...versions].sort().join(', ') || '(none)');
      const lines = [
        ...(from === to ? [] : [`${name} ${from} → ${to}`]),
        ...[...changed].map((what) => `${name} ${what}`),
      ];
      // Same versions, different keys: only a peer suffix changed.
      return lines.length ? lines : [`${name} ${to} (dependencies changed)`];
    });
  // A changed dependency also changes its parents' edges; only mention those when nothing else explains it.
  const explained = parts.filter((part) => !part.endsWith('(dependencies changed)'));
  const shown = explained.length ? explained : parts;
  return shown.length > 8 ? `${shown.slice(0, 8).join('; ')}; +${shown.length - 8} more` : shown.join('; ');
}

/** Describe a lockfile change that can alter the runtime's resolved dependencies, or null. */
export function describeLockfileChange(before, after, declared) {
  if (before === after) return null;
  if (before === null || after === null) return 'added or removed';
  const [old, next] = [
    ['merge-base', before],
    ['HEAD', after],
  ].map(([side, text]) => {
    try {
      const lockfile = parseLockfile(text);
      return { sections: lockfile.sections, ...runtimeClosure(lockfile, declared) };
    } catch (error) {
      throw new Error(`${error.message} (at ${side})`);
    }
  });
  const reasons = [];
  const sections = [...new Set([...old.sections.keys(), ...next.sections.keys()])].filter(
    (key) => old.sections.get(key) !== next.sections.get(key),
  );
  if (sections.length) reasons.push(`lockfile ${sections.join(', ')} changed`);
  const closure = describeClosureChange(old, next);
  if (closure) reasons.push(`runtime dependency closure changed: ${closure}`);
  return reasons.length ? reasons.join('; ') : null;
}

/** Run a content check; anything that cannot be analysed counts as a runtime change. */
function failSafe(analyse) {
  return (context) => {
    try {
      return analyse(context);
    } catch (error) {
      return `could not be analysed, treating as runtime source: ${error.message}`;
    }
  };
}

export function checkRuntimeVersion(base = process.env.NX_AFFECTED_BASE ?? 'origin/main') {
  let declared;
  const rootFileRule = (path, describe) =>
    failSafe(({ ancestor, show }) => {
      declared ??= declaredRuntimeDependencies(show(ancestor, runtimePackagePath), show('HEAD', runtimePackagePath));
      return describe(show(ancestor, path), show('HEAD', path), declared);
    });
  return checkReleaseVersion({
    base,
    versionFile: manifestPath,
    isSource: isRuntimeSource,
    readVersion: (manifest) => JSON.parse(manifest).runtimeVersion,
    label: 'WAGO CC100 runtime',
    contentSources: {
      'package.json': rootFileRule('package.json', describePackageJsonChange),
      'pnpm-lock.yaml': rootFileRule('pnpm-lock.yaml', describeLockfileChange),
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
