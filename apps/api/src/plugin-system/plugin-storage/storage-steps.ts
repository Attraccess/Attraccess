import type { PluginStorageMigrationStep } from '@attraccess/plugins-backend-sdk';
import { compileField, compileTable, fail, physicalTableName, type StorageNaming } from './storage-compile';
import type { CompiledField, CompiledSchema, CompiledTable, ResolvedStep } from './storage-model';

/** The tables a migration step starts from, the physical names of the head, and where the step sits in its history. */
interface StepContext<Step> {
  readonly naming: StorageNaming;
  readonly schema: CompiledSchema;
  readonly step: Step;
  readonly headPhysical: ReadonlyMap<string, string>;
  readonly label: string;
}

interface AppliedStep {
  readonly resolved: ResolvedStep;
  readonly schema: CompiledSchema;
}

type StepOf<Op extends PluginStorageMigrationStep['op']> = Extract<PluginStorageMigrationStep, { op: Op }>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function withTable(schema: CompiledSchema, table: CompiledTable): CompiledSchema {
  return new Map(schema).set(table.logical, table);
}

function tableOf(naming: StorageNaming, schema: CompiledSchema, logical: unknown, label: string): CompiledTable {
  const table = typeof logical === 'string' ? schema.get(logical) : undefined;
  return table ?? fail(naming, `${label}: unknown table "${String(logical)}"`);
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

function createTable({ naming, schema, step, headPhysical, label }: StepContext<StepOf<'createTable'>>): AppliedStep {
  const logical = step.table;
  if (typeof logical !== 'string' || schema.has(logical))
    return fail(naming, `${label}: table "${String(logical)}" exists`);
  const declared = (step.definition as { physicalName?: unknown } | undefined)?.physicalName;
  const physical = physicalTableName(naming, logical, declared ?? headPhysical.get(logical) ?? undefined);
  const table = compileTable(naming, logical, step.definition, physical, (name) =>
    name === logical ? physical : schema.get(name)?.physical,
  );
  return { resolved: { op: 'createTable', table }, schema: withTable(schema, table) };
}

function dropTable({ naming, schema, step, label }: StepContext<StepOf<'dropTable'>>): AppliedStep {
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

/** Checks an added field against the table it joins: it must be new, ordinary and fillable for existing rows. */
function checkAddedField(naming: StorageNaming, table: CompiledTable, field: CompiledField, label: string): void {
  if (field.generated) fail(naming, `${label}: a generated field cannot be added to an existing table`);
  if (!field.nullable && !field.hasDefault)
    fail(naming, `${label}: adding the required field "${field.name}" needs a default`);
  if (field.default && typeof field.default === 'object')
    fail(naming, `${label}: an added column cannot default to now`);
  if ([...table.fields.values()].some((existing) => existing.column === field.column)) {
    fail(naming, `${label}: column "${field.column}" exists`);
  }
}

function addColumn({ naming, schema, step, label }: StepContext<StepOf<'addColumn'>>): AppliedStep {
  const table = tableOf(naming, schema, step.table, label);
  const name = String(step.field);
  if (table.fields.has(name)) return fail(naming, `${label}: field "${table.logical}.${name}" exists`);
  const field = compileField(naming, table.logical, name, step.definition);
  checkAddedField(naming, table, field, label);
  const next = { ...table, fields: new Map(table.fields).set(name, field) };
  return { resolved: { op: 'addColumn', table, field }, schema: withTable(schema, next) };
}

function dropColumn({ naming, schema, step, label }: StepContext<StepOf<'dropColumn'>>): AppliedStep {
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

function renameColumn({ naming, schema, step, label }: StepContext<StepOf<'renameColumn'>>): AppliedStep {
  const table = tableOf(naming, schema, step.table, label);
  const from = table.fields.get(String(step.from));
  if (!from) return fail(naming, `${label}: unknown field "${table.logical}.${String(step.from)}"`);
  if (table.fields.has(String(step.to))) fail(naming, `${label}: field "${String(step.to)}" exists`);
  const to = { ...from, name: String(step.to), column: String(step.to) };
  compileField(naming, table.logical, to.name, { ...from, column: to.column });
  const rename = (name: string) => (name === from.name ? to.name : name);
  const fields = new Map<string, CompiledField>();
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

function addIndex({ naming, schema, step, label }: StepContext<StepOf<'addIndex'>>): AppliedStep {
  const table = tableOf(naming, schema, step.table, label);
  const probe = compileTable(
    naming,
    table.logical,
    { ...rawOf(table), indexes: [step.index] },
    table.physical,
    () => undefined,
  );
  const index = probe.indexes[0];
  const clash = [...schema.values()].some((other) =>
    other.indexes.some((i) => i.name.toLowerCase() === index.name.toLowerCase()),
  );
  if (clash) fail(naming, `${label}: index "${index.name}" exists`);
  return {
    resolved: { op: 'addIndex', table, index },
    schema: withTable(schema, { ...table, indexes: [...table.indexes, index] }),
  };
}

function dropIndex({ naming, schema, step, label }: StepContext<StepOf<'dropIndex'>>): AppliedStep {
  const table = tableOf(naming, schema, step.table, label);
  const index = table.indexes.find((candidate) => candidate.name === step.name);
  if (!index) return fail(naming, `${label}: unknown index "${String(step.name)}" on "${table.logical}"`);
  return {
    resolved: { op: 'dropIndex', table, index },
    schema: withTable(schema, { ...table, indexes: table.indexes.filter((candidate) => candidate !== index) }),
  };
}

type StepHandler = (context: StepContext<never>) => AppliedStep;

const STEP_HANDLERS = new Map<string, StepHandler>([
  ['createTable', createTable],
  ['dropTable', dropTable],
  ['addColumn', addColumn],
  ['dropColumn', dropColumn],
  ['renameColumn', renameColumn],
  ['addIndex', addIndex],
  ['dropIndex', dropIndex],
]);

/** Applies one raw step to `schema`. Returns the resolved step and the schema after it. */
export function applyStep(
  naming: StorageNaming,
  schema: CompiledSchema,
  step: PluginStorageMigrationStep,
  headPhysical: ReadonlyMap<string, string>,
  label: string,
): AppliedStep {
  if (!isRecord(step)) return fail(naming, `${label} is not a step`);
  const handler = STEP_HANDLERS.get(String(step.op));
  if (!handler) return fail(naming, `${label} has the unknown operation "${String(step.op)}"`);
  return handler({ naming, schema, step, headPhysical, label } as StepContext<never>);
}
