import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'fs';
import { join, relative } from 'path';
import * as semver from 'semver';
import forbiddenModules from './forbidden-plugin-modules.json';

/** The first host version whose plugin SDK has no TypeORM surface and no database access (SDK 2.0). */
export const MINIMUM_PLUGIN_HOST_VERSION = '2.0.0-0';
export const PLUGIN_MIGRATION_GUIDE_URL = 'https://docs.attraccess.org/#/en/plugins/migrating-to-2';

/** A plugin the host refuses before any database or filesystem mutation. */
export class PluginIncompatibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginIncompatibleError';
  }
}

/** Plugin names come from untrusted manifests: only a short identifier is echoed. */
const safeName = (name: string): string => (/^[\w@./-]{1,100}$/.test(name) ? name : '(unnamed plugin)');

const refuse = (pluginName: string, reason: string, hint: string): PluginIncompatibleError =>
  new PluginIncompatibleError(
    `Plugin ${safeName(pluginName)} ${reason}. ${hint} Migration guide: ${PLUGIN_MIGRATION_GUIDE_URL}`,
  );

/**
 * Plugins built for SDK 1.x expose TypeORM and host entities and cannot run on this host. They are recognised by a
 * declared minimum host version below 2.0.0-0 (a missing minimum counts as below).
 */
export function assertPluginTargetsSdk2(pluginName: string, minimumHostVersion: string | undefined): void {
  const min = minimumHostVersion ? semver.valid(minimumHostVersion) : null;
  if (min && semver.gte(min, MINIMUM_PLUGIN_HOST_VERSION)) return;
  throw new PluginIncompatibleError(
    `Plugin ${safeName(pluginName)} targets Attraccess ${minimumHostVersion ?? '(no minimum version)'} and the ` +
      `plugin SDK 1.x, which this host no longer supports. Rebuild it for SDK 2.0 and declare ` +
      `attraccessVersion.min >= ${MINIMUM_PLUGIN_HOST_VERSION}. Migration guide: ${PLUGIN_MIGRATION_GUIDE_URL}`,
  );
}

/** The host-range form used by npm packages (`attraccess.host`): its lowest allowed version must be SDK 2.0. */
export function assertHostRangeTargetsSdk2(pluginName: string, hostRange: string): void {
  let lowest: string | undefined;
  try {
    lowest = semver.minVersion(hostRange)?.version;
  } catch {
    lowest = undefined;
  }
  assertPluginTargetsSdk2(pluginName, lowest);
}

/** Permissions of SDK 1.x that opened the database. SDK 2.0 has none: data goes through `PLUGIN_STORAGE`. */
const REMOVED_PERMISSIONS = ['DATABASE_ACCESS', 'PLUGIN_ENGINE_ACCESS'];

/** The plugin.json fields that only an SDK 1.x plugin with its own database access has. */
export interface RemovedContractFields {
  permissions?: readonly unknown[];
  /** `persistence` of plugin.json (the engines list). */
  persistence?: unknown;
  /** The legacy TypeORM `migrations` entry. */
  migrations?: unknown;
}

/**
 * Refuses an SDK 2.0 manifest that still uses the database access of SDK 1.x: the removed permission, the engine
 * list, or a TypeORM migrations entry. Plugins keep data through the declared storage (PLUGIN_STORAGE) instead.
 */
export function assertNoRemovedContract(pluginName: string, fields: RemovedContractFields): void {
  const removed = (fields.permissions ?? []).find(
    (permission): permission is string => typeof permission === 'string' && REMOVED_PERMISSIONS.includes(permission),
  );
  if (removed) {
    throw refuse(
      pluginName,
      `requests the ${removed} permission, which SDK 2.0 removed: plugins have no database access`,
      "Declare the plugin's tables with definePluginStorage and request PLUGIN_STORAGE instead.",
    );
  }
  if (fields.persistence !== undefined) {
    throw refuse(
      pluginName,
      'declares persistence.backends in plugin.json, which SDK 2.0 removed: the host owns the database engine',
      "Remove the field and describe the plugin's tables with definePluginStorage.",
    );
  }
  if (fields.migrations !== undefined) {
    throw refuse(
      pluginName,
      'ships a TypeORM migrations entry (main.migrations), which SDK 2.0 removed',
      "Declare neutral migrations in the plugin's storage definition instead.",
    );
  }
}

/** The manifest fields the host checks before a plugin is installed, started or migrated. */
export interface PluginCompatibilityManifest {
  name: string;
  attraccessVersion?: { min?: string };
  /** `main` of plugin.json; only its legacy `migrations` entry is read. */
  main?: unknown;
  permissions?: readonly unknown[];
  persistence?: unknown;
}

/** SDK 2.0 contract of a manifest. Shared by ZIP uploads, npm installs and discovery; call it before parsing. */
export function assertManifestCompatible(manifest: PluginCompatibilityManifest): void {
  assertPluginTargetsSdk2(manifest.name, manifest.attraccessVersion?.min);
  assertNoRemovedContract(manifest.name, {
    permissions: manifest.permissions,
    persistence: manifest.persistence,
    migrations: (manifest.main as { migrations?: unknown } | null | undefined)?.migrations,
  });
}

/**
 * Modules a plugin bundle may not import: database engines and ORMs, the host's entities, and the removed SDK engine
 * subpath (see forbidden-plugin-modules.json, shared with the lint and the packaging checks). A plugin has no database
 * access; importing one is refused before the bundle is loaded.
 */
export const FORBIDDEN_BUNDLE_MODULES: readonly string[] = [
  ...forbiddenModules.engines,
  ...forbiddenModules.frameworks,
  ...forbiddenModules.host,
];

/** Whether `specifier` is the forbidden `entry` or one of its subpaths (or, for a `@scope/*` entry, in the scope). */
export const matchesForbiddenModule = (specifier: string, entry: string): boolean =>
  entry.endsWith('/*')
    ? specifier.startsWith(entry.slice(0, -1))
    : specifier === entry || specifier.startsWith(`${entry}/`);

const IMPORT_PATTERN = /(?:\brequire\s*\(\s*|\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'`])([^"'`\s]+)\1/g;
const SCANNED_EXTENSIONS = /\.(?:[cm]?js)$/;
const MAX_SCANNED_FILES = 2000;
const MAX_SCANNED_BYTES = 128 * 1024 * 1024;

/** The forbidden modules a piece of JavaScript source imports. */
export function findForbiddenImports(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = match[2];
    const hit = FORBIDDEN_BUNDLE_MODULES.find((module) => matchesForbiddenModule(specifier, module));
    if (hit) found.add(hit);
  }
  return [...found];
}

/** A script of the bundle to read, or a package it vendors under node_modules. */
type BundleEntry =
  | { readonly kind: 'script'; readonly path: string }
  | { readonly kind: 'package'; readonly name: string; readonly path: string };

/** The entries of a directory with symbolic links followed; each real directory is visited once. */
function* children(
  directory: string,
  seen: Set<string>,
): Generator<{ name: string; path: string; directory: boolean }> {
  const real = realpathSync(directory);
  if (seen.has(real)) return;
  seen.add(real);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const stats = entry.isSymbolicLink() ? statSync(path, { throwIfNoEntry: false }) : entry;
    if (stats?.isDirectory()) yield { name: entry.name, path, directory: true };
    else if (stats?.isFile()) yield { name: entry.name, path, directory: false };
  }
}

/** The packages vendored in a node_modules directory (and in theirs). They are judged by name, not read. */
function* vendoredPackages(nodeModules: string, seen: Set<string>): Generator<BundleEntry> {
  for (const entry of children(nodeModules, seen)) {
    if (!entry.directory) continue;
    const packages = entry.name.startsWith('@')
      ? [...children(entry.path, seen)]
          .filter((inner) => inner.directory)
          .map((inner) => ({ ...inner, name: `${entry.name}/${inner.name}` }))
      : [entry];
    for (const vendored of packages) {
      yield { kind: 'package', name: vendored.name, path: vendored.path };
      const nested = join(vendored.path, 'node_modules');
      if (existsSync(nested)) yield* vendoredPackages(nested, seen);
    }
  }
}

/** The scripts of a bundle and the packages it vendors. */
function* bundleEntries(directory: string, seen = new Set<string>()): Generator<BundleEntry> {
  for (const entry of children(directory, seen)) {
    if (entry.directory) {
      yield* entry.name === 'node_modules' ? vendoredPackages(entry.path, seen) : bundleEntries(entry.path, seen);
    } else if (SCANNED_EXTENSIONS.test(entry.name)) {
      yield { kind: 'script', path: entry.path };
    }
  }
}

function refuseImport(pluginName: string, module: string, where: string): PluginIncompatibleError {
  return refuse(
    pluginName,
    `imports "${module}" (in ${where}), which plugins may not use: SDK 2.0 plugins have no database access`,
    'Keep data through context.storage (permission PLUGIN_STORAGE) and read host data through context.hostData.',
  );
}

/**
 * Refuses a backend bundle that imports a database package, the host's entities or the removed engine subpath, or
 * vendors one under node_modules. Reads the JavaScript files of the backend directory and never executes them. A
 * bundle too large to read completely is refused. A missing directory passes: the entry point check reports it.
 */
export function assertBundleCompatible(pluginName: string, backendDirectory: string): void {
  if (!existsSync(backendDirectory)) return;
  let files = 0;
  let bytes = 0;
  for (const entry of bundleEntries(backendDirectory)) {
    const where = relative(backendDirectory, entry.path);
    if (entry.kind === 'package') {
      const module = FORBIDDEN_BUNDLE_MODULES.find((candidate) => matchesForbiddenModule(entry.name, candidate));
      if (module) throw refuseImport(pluginName, module, where);
      continue;
    }
    bytes += statSync(entry.path).size;
    if (++files > MAX_SCANNED_FILES || bytes > MAX_SCANNED_BYTES) {
      throw refuse(
        pluginName,
        `has a backend bundle too large to check (more than ${MAX_SCANNED_FILES} scripts or ` +
          `${MAX_SCANNED_BYTES / 1024 / 1024} MB)`,
        'Bundle the backend into fewer files.',
      );
    }
    const [module] = findForbiddenImports(readFileSync(entry.path, 'utf8'));
    if (module) throw refuseImport(pluginName, module, where);
  }
}
