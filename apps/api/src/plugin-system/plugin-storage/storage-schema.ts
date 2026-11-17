import type { PluginStorageMigrationStep } from '@attraccess/plugins-backend-sdk';
import {
  compileField,
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

export { namespaceOf } from './storage-compile';
export * from './storage-model';

const MAX_MIGRATIONS = 500;
const MAX_STEPS_PER_MIGRATION = 200;
const LEGACY_NAME = /^[A-Za-z][A-Za-z0-9_]{0,127}$/;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function withTable(schema: CompiledSchema, table: CompiledTable): CompiledSchema {
  return new Map(schema).set(table.logical, table);
}

function tableOf(naming: StorageNaming, schema: CompiledSchema, logical: unknown, label: string): CompiledTable {
  const table = typeof logical === 'string' ? schema.get(logical) : undefined;
  return table ?? fail(naming, `${label}: unknown table "${String(logical)}"`);
}

/** Applies one raw step to `schema`. Returns the resolved step and the schema after it. */
function applyStep(
  naming: StorageNaming,
  schema: CompiledSchema,
  step: PluginStorageMigrationStep,
  headPhysical: ReadonlyMap<string, string>,
  label: string,
): { resolved: ResolvedStep; schema: CompiledSchema } {
  if (!isRecord(step)) return fail(naming, `${label} is not a step`);
  switch (step.op) {
    case 'createTable': {
      const logical = step.table;
      if (typeof logical !== 'string' || schema.has(logical)) return fail(naming, `${label}: table "${String(logical)}" exists`);
      const declared = (step.definition as { physicalName?: unknown } | undefined)?.physicalName;
      const physical = physicalTableName(naming, logical, declared ?? headPhysical.get(logical) ?? undefined);
      const table = compileTable(naming, logical, step.definition, physical, (name) =>
        name === logical ? physical : schema.get(name)?.physical,
      );
      return { resolved: { op: 'createTable', table }, schema: withTable(schema, table) };
    }
    case 'dropTable': {
      const table = tableOf(naming, schema, step.table, label);
      const next = new Map(schema);
      next.delete(table.logical);
      for (const other of next.values()) {
        if (other.foreignKeys.some((fk) => fk.references === table.logical)) {
          fail(naming, `${label}: table "${other.logical}" still references "${table.logical}"`);
        }
      }
      return { resolved: { op: 'dropTable', table }, schema: next };
    }
    case 'addColumn': {
      const table = tableOf(naming, schema, step.table, label);
      const name = String(step.field);
      if (table.fields.has(name)) return fail(naming, `${label}: field "${table.logical}.${name}" exists`);
      const field = compileField(naming, table.logical, name, step.definition);
      if (field.generated) fail(naming, `${label}: a generated field cannot be added to an existing table`);
      if (!field.nullable && !field.hasDefault) fail(naming, `${label}: adding the required field "${name}" needs a default`);
      if (field.default && typeof field.default === 'object') fail(naming, `${label}: an added column cannot default to now`);
      const columns = [...table.fields.values()].map((existing) => existing.column);
      if (columns.includes(field.column)) fail(naming, `${label}: column "${field.column}" exists`);
      const next = { ...table, fields: new Map(table.fields).set(name, field) };
      return { resolved: { op: 'addColumn', table, field }, schema: withTable(schema, next) };
    }
    case 'dropColumn': {
      const table = tableOf(naming, schema, step.table, label);
      const field = table.fields.get(String(step.field));
      if (!field) return fail(naming, `${label}: unknown field "${table.logical}.${String(step.field)}"`);
      const used =
        table.primaryKey.includes(field.name) ||
        table.indexes.some((index) => index.fields.includes(field.name)) ||
        table.foreignKeys.some((fk) => fk.fields.includes(field.name));
      if (used) fail(naming, `${label}: field "${field.name}" is part of a key or index; drop that first`);
      const fields = new Map(table.fields);
      fields.delete(field.name);
      return { resolved: { op: 'dropColumn', table, field }, schema: withTable(schema, { ...table, fields }) };
    }
    case 'renameColumn': {
      const table = tableOf(naming, schema, step.table, label);
      const from = table.fields.get(String(step.from));
      if (!from) return fail(naming, `${label}: unknown field "${table.logical}.${String(step.from)}"`);
      if (table.fields.has(String(step.to))) fail(naming, `${label}: field "${String(step.to)}" exists`);
      const to = { ...from, name: String(step.to), column: String(step.to) };
      compileField(naming, table.logical, to.name, { ...from, column: to.column });
      const rename = (name: string) => (name === from.name ? to.name : name);
      const fields = new Map<string, typeof from>();
      for (const [name, field] of table.fields) fields.set(rename(name), name === from.name ? to : field);
      const next: CompiledTable = {
        ...table,
        fields,
        primaryKey: table.primaryKey.map(rename),
        indexes: table.indexes.map((index) => ({ ...index, fields: index.fields.map(rename) })),
        foreignKeys: table.foreignKeys.map((fk) => ({ ...fk, fields: fk.fields.map(rename) })),
      };
      return { resolved: { op: 'renameColumn', table, from, to }, schema: withTable(schema, next) };
    }
    case 'addIndex': {
      const table = tableOf(naming, schema, step.table, label);
      const probe = compileTable(naming, table.logical, { ...rawOf(table), indexes: [step.index] }, table.physical, () => undefined);
      const index = probe.indexes[0];
      const clash = [...schema.values()].some((other) => other.indexes.some((i) => i.name.toLowerCase() === index.name.toLowerCase()));
      if (clash) fail(naming, `${label}: index "${index.name}" exists`);
      return {
        resolved: { op: 'addIndex', table, index },
        schema: withTable(schema, { ...table, indexes: [...table.indexes, index] }),
      };
    }
    case 'dropIndex': {
      const table = tableOf(naming, schema, step.table, label);
      const index = table.indexes.find((candidate) => candidate.name === step.name);
      if (!index) return fail(naming, `${label}: unknown index "${String(step.name)}" on "${table.logical}"`);
      return {
        resolved: { op: 'dropIndex', table, index },
        schema: withTable(schema, { ...table, indexes: table.indexes.filter((candidate) => candidate !== index) }),
      };
    }
    default:
      return fail(naming, `${label} has the unknown operation "${String((step as { op?: unknown }).op)}"`);
  }
}

/** A table as `compileTable` takes it, for validating a piece of it (an index) against its fields. */
function rawOf(table: CompiledTable): Record<string, unknown> {
  return {
    fields: Object.fromEntries(table.fields),
    primaryKey: table.primaryKey,
    indexes: [],
    foreignKeys: [],
  };
}

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
    if (version !== position + 1) fail(naming, `migration #${position + 1} must have version ${position + 1} (versions start at 1, no gaps)`);
    if (typeof name !== 'string' || name.length === 0 || name.length > 200) fail(naming, `migration ${version} needs a name`);
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
    result.push({ version, name: name as string, steps: resolved, schemaAfter: schema, data: data as CompiledMigration['data'] });
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
  const naming: StorageNaming = { pluginName, namespace: namespaceOf(pluginName), reservedTables: options.reservedTables };
  if (!isRecord(definition) || !isRecord(definition.tables)) return fail(naming, 'use definePluginStorage({ tables, migrations })');

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
  if (!Array.isArray(names) || names.length === 0 || names.some((name) => typeof name !== 'string' || !LEGACY_NAME.test(name))) {
    return fail(naming, 'adoption.legacyMigrations must list the class names of the 1.x migrations');
  }
  if (new Set(names).size !== names.length) fail(naming, 'adoption.legacyMigrations lists a name twice');
  return names as string[];
}
