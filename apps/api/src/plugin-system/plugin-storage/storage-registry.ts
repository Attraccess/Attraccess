import { foreignNamespaceOf, indexNameBody } from './storage-namespace';
import { PluginStorageDeclarationError, type CompiledPluginStorage } from './storage-model';

/**
 * Which plugin owns which physical table and index name in the database. Names are unique per database, and a
 * plugin's names must stay out of every other plugin's storage namespace (see storage-namespace), so the plugin that
 * claims second does not migrate or load. Claims are made before a plugin's migrations run.
 */
interface Claim {
  readonly namespace: string;
  /** Lowercase `table:<name>` / `index:<name>` keys. */
  readonly names: readonly string[];
}

const claims = new Map<string, Claim>();

function namesOf(storage: CompiledPluginStorage): string[] {
  const names: string[] = [];
  const tables = [
    ...storage.migrations.flatMap((migration) => [...migration.schemaAfter.values()]),
    ...storage.tables.values(),
  ];
  for (const table of tables) {
    names.push(`table:${table.physical.toLowerCase()}`);
    for (const index of table.indexes) names.push(`index:${index.name.toLowerCase()}`);
  }
  for (const table of storage.ownedTables) names.push(`table:${table.toLowerCase()}`);
  return [...new Set(names)];
}

const kindOf = (key: string): string => key.slice(0, key.indexOf(':'));
const nameOf = (key: string): string => key.slice(key.indexOf(':') + 1);
/** The part of a claimed name that must lie in its owner's namespace. */
const bodyOf = (key: string): string => (kindOf(key) === 'index' ? indexNameBody(nameOf(key)) : nameOf(key));

/** Why `pluginName` (namespace `namespace`, claiming `names`) conflicts with the claim of `other`, if it does. */
function conflictWith(namespace: string, names: readonly string[], other: string, claim: Claim): string | undefined {
  if (claim.namespace === namespace) {
    return `its storage namespace "${namespace}" is the one of plugin "${other}" (plugin names that differ only in case or punctuation share their tables)`;
  }
  const taken = new Set(claim.names);
  const clash = names.find((key) => taken.has(key));
  if (clash) return `the ${kindOf(clash)} "${nameOf(clash)}" already belongs to plugin "${other}"`;
  const inside = names.find((key) => foreignNamespaceOf(bodyOf(key), namespace, [claim.namespace]) !== undefined);
  if (inside) {
    return `the ${kindOf(inside)} "${nameOf(inside)}" lies in the storage namespace "${claim.namespace}" of plugin "${other}"`;
  }
  const theirs = claim.names.find((key) => foreignNamespaceOf(bodyOf(key), claim.namespace, [namespace]) !== undefined);
  if (theirs) {
    return `plugin "${other}" keeps the ${kindOf(theirs)} "${nameOf(theirs)}" inside this plugin's storage namespace "${namespace}"`;
  }
  return undefined;
}

function assertNoConflict(pluginName: string, namespace: string, names: readonly string[]): void {
  for (const [other, claim] of claims) {
    if (other === pluginName) continue;
    const conflict = conflictWith(namespace, names, other, claim);
    if (conflict) throw new PluginStorageDeclarationError(pluginName, conflict);
  }
}

/**
 * Throws when a name of `storage` belongs to another plugin, lies in another plugin's namespace (or one of the other
 * plugin's names lies in this one's), or both plugins share a namespace. Changes nothing; a new release of the same
 * plugin never conflicts with its own claim.
 */
export function assertStorageNamesFree(storage: CompiledPluginStorage): void {
  assertNoConflict(storage.pluginName, storage.namespace, namesOf(storage));
}

/** Claims every table and index name of `storage` for its plugin. Throws (claiming nothing) on a conflict. */
export function claimStorageNames(storage: CompiledPluginStorage): void {
  const names = namesOf(storage);
  assertNoConflict(storage.pluginName, storage.namespace, names);
  claims.set(storage.pluginName, { namespace: storage.namespace, names });
}

/**
 * Throws when a plugin named `pluginName` (namespace `namespace`) could not claim storage beside the loaded plugins:
 * one shares its namespace or keeps a name inside it. For installs, before the plugin's code is read.
 */
export function assertNamespaceUnclaimed(pluginName: string, namespace: string): void {
  assertNoConflict(pluginName, namespace, []);
}

/** Forgets the claims of a plugin (an unloaded plugin, tests). */
export function releaseStorageNames(pluginName: string): void {
  claims.delete(pluginName);
}
