import type { PluginStorageIndex, PluginStorageMigrationStep } from '@attraccess/plugins-backend-sdk';
import {
  compileTableBase,
  fail,
  namespaceOf,
  physicalTableName,
  type StorageNaming,
  tableSignature,
  withForeignKeys,
} from './storage-compile';
import {
  type CompiledIndex,
  type CompiledMigration,
  type CompiledPluginStorage,
  type CompiledSchema,
  type CompiledTable,
  PluginStorageDeclarationError,
  type ResolvedStep,
} from './storage-model';
import { applyStep } from './storage-steps';

export { namespaceOf } from './storage-compile';
export * from './storage-model';

const MAX_MIGRATIONS = 500;
const MAX_STEPS_PER_MIGRATION = 200;
const LEGACY_NAME = /^[A-Za-z][A-Za-z0-9_]{0,127}$/;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function compileMigrations(
  naming: StorageNaming,
  declared: unknown,
  headPhysical: ReadonlyMap<string, string>,
  adopting: boolean,
): CompiledMigration[] {
  if (!Array.isArray(declared)) return fail(naming, 'migrations must be a list');
  if (declared.length > MAX_MIGRATIONS) fail(naming, `at most ${MAX_MIGRATIONS} migrations`);
  const result: CompiledMigration[] = [];
  let schema: CompiledSchema = new Map();
  declared.forEach((migration, position) => {
    if (!isRecord(migration)) return fail(naming, `migration #${position + 1} is malformed`);
    const { version, name, steps, data } = migration;
    if (version !== position + 1)
      fail(naming, `migration #${position + 1} must have version ${position + 1} (versions start at 1, no gaps)`);
    if (typeof name !== 'string' || name.length === 0 || name.length > 200)
      fail(naming, `migration ${version} needs a name`);
    if (data !== undefined && typeof data !== 'function') fail(naming, `migration ${version}: data must be a function`);
    if (steps !== undefined && !Array.isArray(steps)) fail(naming, `migration ${version}: steps must be a list`);
    if (((steps as unknown[] | undefined)?.length ?? 0) > MAX_STEPS_PER_MIGRATION) {
      fail(naming, `migration ${version}: at most ${MAX_STEPS_PER_MIGRATION} steps`);
    }
    const resolved: ResolvedStep[] = [];
    // Only version 1 of an adopting definition creates the 1.x tables, which keep their own names.
    const stepNaming: StorageNaming = { ...naming, adoptable: adopting && version === 1 };
    ((steps as PluginStorageMigrationStep[] | undefined) ?? []).forEach((step, index) => {
      const applied = applyStep(stepNaming, schema, step, headPhysical, `migration ${version} step ${index + 1}`);
      resolved.push(applied.resolved);
      schema = applied.schema;
    });
    result.push({
      version,
      name: name as string,
      steps: resolved,
      schemaAfter: schema,
      data: data as CompiledMigration['data'],
    });
  });
  return result;
}

/** The tables a migration history ever created, parents before children. */
function ownedTablesOf(migrations: readonly CompiledMigration[], head: CompiledSchema): string[] {
  const owned: string[] = [];
  for (const migration of migrations) {
    for (const step of migration.steps) {
      if (step.op === 'createTable' && !owned.includes(step.table.physical)) owned.push(step.table.physical);
    }
  }
  for (const table of head.values()) if (!owned.includes(table.physical)) owned.push(table.physical);
  return owned;
}

function assertHeadMatches(naming: StorageNaming, head: CompiledSchema, replayed: CompiledSchema): void {
  for (const [logical, table] of head) {
    const built = replayed.get(logical);
    if (!built) fail(naming, `table "${logical}" is declared but no migration creates it`);
    if (tableSignature(table) !== tableSignature(built as CompiledTable)) {
      fail(naming, `table "${logical}": the migrations do not produce the declared layout (fields, keys, indexes)`);
    }
  }
  for (const logical of replayed.keys()) {
    if (!head.has(logical)) fail(naming, `migrations leave the table "${logical}" that is not declared in tables`);
  }
}

export interface CompileOptions {
  /** Tables the host owns; a plugin may not claim them. */
  readonly reservedTables: ReadonlySet<string>;
  /** Namespaces of the other installed plugins; see {@link StorageNaming.siblingNamespaces}. */
  readonly siblingNamespaces?: ReadonlySet<string>;
}

/**
 * Validates a plugin's `definePluginStorage` declaration and resolves every name. Throws
 * PluginStorageDeclarationError for anything malformed, outside the plugin's namespace or inconsistent: the tables
 * declared must be exactly what the migrations produce.
 */
export function compilePluginStorage(
  pluginName: string,
  definition: unknown,
  options: CompileOptions,
): CompiledPluginStorage {
  const adopting = isRecord(definition) && definition.adoption !== undefined;
  // The head may carry the adopted names; the migrations decide where they are allowed (version 1 only).
  const naming: StorageNaming = {
    pluginName,
    namespace: namespaceOf(pluginName),
    reservedTables: options.reservedTables,
    siblingNamespaces: options.siblingNamespaces,
    adoptable: adopting,
    legacyNamespace: legacyNamespaceOf(pluginName, definition),
  };
  if (!isRecord(definition) || !isRecord(definition.tables))
    return fail(naming, 'use definePluginStorage({ tables, migrations })');

  const headPhysical = new Map<string, string>();
  for (const [logical, decl] of Object.entries(definition.tables)) {
    const explicit = (decl as { physicalName?: unknown } | undefined)?.physicalName;
    headPhysical.set(logical, physicalTableName(naming, logical, explicit));
  }
  const taken = new Set<string>();
  for (const physical of headPhysical.values()) {
    if (taken.has(physical.toLowerCase())) fail(naming, `two tables map to "${physical}"`);
    taken.add(physical.toLowerCase());
  }
  const migrations = compileMigrations(naming, definition.migrations, headPhysical, adopting);
  const replayed: CompiledSchema = migrations.at(-1)?.schemaAfter ?? new Map();
  const tables = alignIndexNames(compileHead(naming, definition.tables, headPhysical), definition.tables, replayed);
  if (tables.size > 0 && migrations.length === 0) fail(naming, 'tables are declared but there is no migration');
  assertHeadMatches(naming, tables, replayed);

  const legacy = readLegacy(naming, definition.adoption);
  return {
    pluginName,
    namespace: naming.namespace,
    tables,
    migrations,
    legacyMigrations: legacy,
    ...(naming.legacyNamespace === undefined ? {} : { legacyNamespace: naming.legacyNamespace }),
    ownedTables: ownedTablesOf(migrations, tables),
    definition,
  };
}

/** The declared head tables: every table first, then the foreign keys, which may point at any of them. */
function compileHead(
  naming: StorageNaming,
  declared: Record<string, unknown>,
  headPhysical: ReadonlyMap<string, string>,
): Map<string, CompiledTable> {
  const bases = new Map<string, CompiledTable>();
  for (const [logical, decl] of Object.entries(declared)) {
    bases.set(logical, compileTableBase(naming, logical, decl, headPhysical.get(logical) as string));
  }
  const tables = new Map<string, CompiledTable>();
  for (const [logical, base] of bases) {
    tables.set(
      logical,
      withForeignKeys(naming, base, declared[logical], (name) => bases.get(name)),
    );
  }
  return tables;
}

const sameFields = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((name, position) => b[position] === name);

/**
 * A head index declared without a name has the name the migrations gave it: generated from the fields it was created
 * on, which a later rename does not change. Named indexes keep their name and must match exactly.
 */
function alignIndexNames(
  head: Map<string, CompiledTable>,
  declared: Record<string, unknown>,
  replayed: CompiledSchema,
): Map<string, CompiledTable> {
  for (const [logical, table] of head) {
    const built = replayed.get(logical);
    if (!built) continue;
    const declaredIndexes = (declared[logical] as { indexes?: PluginStorageIndex[] }).indexes ?? [];
    const taken = new Set<CompiledIndex>();
    const indexes = table.indexes.map((index, position) => {
      if (declaredIndexes[position]?.name !== undefined) return index;
      const match = built.indexes.find(
        (candidate) =>
          !taken.has(candidate) && candidate.unique === index.unique && sameFields(candidate.fields, index.fields),
      );
      if (match) taken.add(match);
      return match ? { ...index, name: match.name } : index;
    });
    head.set(logical, { ...table, indexes });
  }
  return head;
}

/**
 * The 1.x namespace an adopting definition declares (`adoption.namespace`), or undefined. Only the official npm package
 * of a 1.x plugin (`@attraccess/plugin-<namespace>`) may declare one other than its own: any other plugin could
 * otherwise place tables in the namespace of an installed plugin, which the install check reads from names alone.
 */
function legacyNamespaceOf(pluginName: string, definition: unknown): string | undefined {
  const adoption = isRecord(definition) && isRecord(definition.adoption) ? definition.adoption : undefined;
  const declared = adoption?.namespace;
  if (declared === undefined) return undefined;
  if (typeof declared !== 'string' || !/^[a-z][a-z0-9_]{0,40}$/.test(declared)) {
    throw new PluginStorageDeclarationError(pluginName, 'adoption.namespace must be a lowercase identifier');
  }
  const own = namespaceOf(pluginName);
  if (declared !== own && own !== `attraccess_plugin_${declared}`) {
    throw new PluginStorageDeclarationError(
      pluginName,
      `adoption.namespace "${declared}" is only allowed for the plugin "${declared}" or its npm package ` +
        `"@attraccess/plugin-${declared}"`,
    );
  }
  return declared;
}

function readLegacy(naming: StorageNaming, adoption: unknown): string[] {
  if (adoption === undefined) return [];
  const names = isRecord(adoption) ? adoption.legacyMigrations : undefined;
  if (
    !Array.isArray(names) ||
    names.length === 0 ||
    names.some((name) => typeof name !== 'string' || !LEGACY_NAME.test(name))
  ) {
    return fail(naming, 'adoption.legacyMigrations must list the class names of the 1.x migrations');
  }
  if (new Set(names).size !== names.length) fail(naming, 'adoption.legacyMigrations lists a name twice');
  return names as string[];
}
