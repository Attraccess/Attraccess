import type { PluginStorageMigrationStep } from '@attraccess/plugins-backend-sdk';
import {
  compileTable,
  fail,
  namespaceOf,
  physicalTableName,
  type StorageNaming,
  tableSignature,
} from './storage-compile';
import {
  type CompiledMigration,
  type CompiledPluginStorage,
  type CompiledSchema,
  type CompiledTable,
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
    ((steps as PluginStorageMigrationStep[] | undefined) ?? []).forEach((step, index) => {
      const applied = applyStep(naming, schema, step, headPhysical, `migration ${version} step ${index + 1}`);
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
  const naming: StorageNaming = {
    pluginName,
    namespace: namespaceOf(pluginName),
    reservedTables: options.reservedTables,
    siblingNamespaces: options.siblingNamespaces,
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
  const tables = new Map<string, CompiledTable>();
  for (const [logical, decl] of Object.entries(definition.tables)) {
    tables.set(
      logical,
      compileTable(naming, logical, decl, headPhysical.get(logical) as string, (name) => headPhysical.get(name)),
    );
  }

  const migrations = compileMigrations(naming, definition.migrations, headPhysical);
  if (tables.size > 0 && migrations.length === 0) fail(naming, 'tables are declared but there is no migration');
  assertHeadMatches(naming, tables, migrations.at(-1)?.schemaAfter ?? new Map());

  const legacy = readLegacy(naming, definition.adoption);
  return {
    pluginName,
    namespace: naming.namespace,
    tables,
    migrations,
    legacyMigrations: legacy,
    ownedTables: ownedTablesOf(migrations, tables),
    definition,
  };
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
