#!/usr/bin/env node
/* eslint-disable no-console -- Release gate diagnostics are intentional. */
// Like the Attractap firmware gate, compare the PR/merge queue with its base.
import { checkReleaseVersion } from './lib/release-version.mjs';
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
    ].includes(path) ||
    path.startsWith('patches/')
  );
}

/* ---- Content-aware rules for the root package.json and pnpm-lock.yaml ---- */

const runtimePackagePath = 'apps/plugins/wago/cc100-runtime/package.json';
const dependencySections = ['dependencies', 'devDependencies', 'optionalDependencies'];

const canonical = (value) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );

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
  if (!a || !b) return 'package.json was added or removed';
  const reasons = [];
  for (const section of dependencySections)
    for (const name of declared)
      if (a[section]?.[name] !== b[section]?.[name])
        reasons.push(`${section}.${name} ${a[section]?.[name] ?? '(none)'} → ${b[section]?.[name] ?? '(none)'}`);
  for (const field of ['overrides', 'patchedDependencies', 'packageExtensions'])
    if (canonical(a.pnpm?.[field]) !== canonical(b.pnpm?.[field])) reasons.push(`pnpm.${field}`);
  if (a.packageManager !== b.packageManager) reasons.push('packageManager');
  return reasons.length ? `runtime dependency inputs changed: ${reasons.join(', ')}` : null;
}

function splitEntry(line) {
  const m = /^\s*(?:'((?:[^']|'')*)'|"([^"]*)"|([^\s'"][^:]*?)):(?:\s+(.*?))?\s*$/.exec(line);
  if (!m) throw new Error(`unexpected lockfile line: ${line.trim()}`);
  const unquote = (v) => {
    if (v === undefined) return '';
    const q = /^'((?:[^']|'')*)'$/.exec(v);
    return q ? q[1].replaceAll("''", "'") : v.replace(/^"(.*)"$/, '$1');
  };
  return { key: m[1] !== undefined ? m[1].replaceAll("''", "'") : (m[2] ?? m[3]), value: unquote(m[4]) };
}

/**
 * Minimal reader for the pnpm v9 lockfile: the root importer's direct dependencies and the `snapshots` graph.
 * Throws on anything it does not understand so callers can fail safe.
 */
export function parseLockfile(text) {
  if (!/^lockfileVersion: '?9\.0'?\s*$/m.test(text))
    throw new Error('unsupported or missing lockfileVersion (expected 9.0)');
  const lines = text.split(/\r?\n/);
  const importer = new Map(); // name -> version, for the root importer
  const snapshots = new Map(); // key -> sorted "name=value" edges
  let top = null;
  let inRoot = false;
  let section = null;
  let entry = null;
  let snapshot = null;
  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      top = splitEntry(line).key;
      inRoot = false;
      section = entry = snapshot = null;
    } else if (top === 'importers') {
      if (indent === 2) inRoot = splitEntry(line).key === '.';
      else if (inRoot && indent === 4) section = splitEntry(line).key;
      else if (inRoot && indent === 6 && dependencySections.includes(section)) entry = splitEntry(line).key;
      else if (inRoot && indent === 8 && entry !== null && dependencySections.includes(section)) {
        const { key, value } = splitEntry(line);
        if (key === 'version') importer.set(entry, value);
      }
    } else if (top === 'snapshots') {
      if (indent === 2) {
        snapshot = splitEntry(line).key;
        snapshots.set(snapshot, []);
        section = null;
      } else if (indent === 4) section = splitEntry(line).key;
      else if (
        indent === 6 &&
        snapshot !== null &&
        (section === 'dependencies' || section === 'optionalDependencies')
      ) {
        const { key, value } = splitEntry(line);
        snapshots.get(snapshot).push(`${key}=${value}`);
      }
    }
  }
  if (!snapshots.size) throw new Error('no snapshots section found');
  for (const edges of snapshots.values()) edges.sort();
  return { importer, snapshots };
}

const snapshotKey = (snapshots, name, version) =>
  snapshots.has(`${name}@${version}`) ? `${name}@${version}` : version;

/** Resolved closure of the given root dependencies: snapshot key -> dependency edges, plus `<root>` entries. */
export function runtimeClosure({ importer, snapshots }, declared) {
  const closure = new Map();
  const queue = [];
  for (const name of [...declared].sort()) {
    const version = importer.get(name);
    if (version === undefined) continue;
    closure.set(`<root> ${name}`, version);
    queue.push([name, version]);
  }
  while (queue.length) {
    const [name, version] = queue.pop();
    if (/^(?:link|file|workspace):/.test(version)) continue;
    const key = snapshotKey(snapshots, name, version);
    if (closure.has(key)) continue;
    const edges = snapshots.get(key);
    if (!edges) throw new Error(`no snapshot for ${key}`);
    closure.set(key, edges.join('\n'));
    for (const edge of edges) {
      const at = edge.indexOf('=');
      queue.push([edge.slice(0, at), edge.slice(at + 1)]);
    }
  }
  return closure;
}

function packageOf(key) {
  const plain = key.replace(/\(.*$/, '');
  const at = plain.lastIndexOf('@');
  return at > 0 ? { name: plain.slice(0, at), version: plain.slice(at + 1) } : { name: plain, version: '' };
}

function describeClosureChange(before, after) {
  const byName = new Map();
  const entry = (name) => byName.get(name) ?? byName.set(name, { old: new Set(), next: new Set() }).get(name);
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(key) === after.get(key)) continue;
    if (key.startsWith('<root> ')) {
      const name = key.slice(7);
      entry(name).old.add(before.has(key) ? packageOf(`${name}@${before.get(key)}`).version : '(none)');
      entry(name).next.add(after.has(key) ? packageOf(`${name}@${after.get(key)}`).version : '(none)');
      continue;
    }
    const { name, version } = packageOf(key);
    if (before.has(key)) entry(name).old.add(version);
    if (after.has(key)) entry(name).next.add(version);
  }
  const parts = [...byName]
    .filter(([name, { old, next }]) => name && (old.size || next.size))
    .map(([name, { old, next }]) => {
      const from = [...old].sort().join(', ');
      const to = [...next].sort().join(', ');
      if (from === to) return `${name} ${to} (dependencies changed)`;
      return `${name} ${from || '(none)'} → ${to || '(removed)'}`;
    });
  return parts.length > 8 ? `${parts.slice(0, 8).join('; ')}; +${parts.length - 8} more` : parts.join('; ');
}

/** Describe a lockfile change that alters the runtime's resolved dependency closure, or null. */
export function describeLockfileChange(before, after, declared) {
  if (before === after) return null;
  if (before === null || after === null) return 'pnpm-lock.yaml was added or removed';
  const closures = [before, after].map((text) => runtimeClosure(parseLockfile(text), declared));
  const [old, next] = closures;
  if ([...new Set([...old.keys(), ...next.keys()])].every((key) => old.get(key) === next.get(key))) return null;
  return `runtime dependency closure changed: ${describeClosureChange(old, next)}`;
}

/** Run a content check; anything that cannot be analysed counts as a runtime change. */
function failSafe(label, analyse) {
  return (context) => {
    try {
      return analyse(context);
    } catch (error) {
      return `${label} could not be analysed, treating as runtime source: ${error.message}`;
    }
  };
}

const rootFileRule = (path, describe) =>
  failSafe(path, ({ ancestor, show }) => {
    const declared = declaredRuntimeDependencies(show(ancestor, runtimePackagePath), show('HEAD', runtimePackagePath));
    return describe(show(ancestor, path), show('HEAD', path), declared);
  });

export function checkRuntimeVersion(base = process.env.NX_AFFECTED_BASE ?? 'origin/main') {
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
