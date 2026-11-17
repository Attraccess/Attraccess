import {
  PluginStorageInvalid,
  PluginStorageUniqueViolation,
  type PluginStorageField,
  type PluginStoragePatch,
  type PluginStorageQuery,
} from '../plugin-storage';
import { deleteWithReferences, verifyReferences } from './references';
import type { TableMeta } from './schema';
import type { StorageState } from './state';
import { cloneValue, normalizeValue, sumDecimals, valuesEqual, type Row } from './values';
import { compileOrder, compileWhere, matches } from './where';

export interface EngineClock {
  now(): Date;
  uuid(): string;
}

export interface AggregateResult {
  min: unknown;
  max: unknown;
  sum: number | string | null;
  count: number;
}

const isIncrement = (value: unknown): value is { increment: number } =>
  typeof value === 'object' && value !== null && !(value instanceof Date) && 'increment' in value;

/** Record operations over the declared tables. Each mutating call is atomic: it applies completely or not at all. */
export class RecordEngine {
  constructor(
    private readonly metas: ReadonlyMap<string, TableMeta>,
    private readonly state: StorageState,
    private readonly clock: EngineClock,
  ) {}

  meta(table: string): TableMeta {
    const meta = this.metas.get(table);
    if (!meta) throw new PluginStorageInvalid(`The table "${table}" is not declared by this plugin.`);
    return meta;
  }

  /** A copy of a row that the plugin may keep and mutate. */
  output(table: string, row: Row): Row {
    const meta = this.meta(table);
    return Object.fromEntries(meta.fieldNames.map((name) => [name, cloneValue(meta.fields[name], row[name])]));
  }

  private atomic<R>(work: () => R): R {
    const snapshot = this.state.snapshot();
    try {
      return work();
    } catch (error) {
      this.state.restore(snapshot);
      throw error;
    }
  }

  /* ----------------------------------------------------------------------------------------------------- *
   * Writes
   * ----------------------------------------------------------------------------------------------------- */

  insertMany(table: string, inputs: readonly unknown[]): Row[] {
    const meta = this.meta(table);
    return this.atomic(() => {
      const created = inputs.map((input) => this.append(meta, this.buildRow(meta, input)));
      verifyReferences(this.metas, this.state, table);
      return created;
    });
  }

  private append(meta: TableMeta, row: Row): Row {
    this.assertUnique(meta, [...this.state.table(meta.name), row], row);
    this.state.setTable(meta.name, [...this.state.table(meta.name), row]);
    return row;
  }

  private buildRow(meta: TableMeta, input: unknown): Row {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new PluginStorageInvalid(`${meta.name}: a row must be an object.`);
    }
    const given = input as Row;
    for (const key of Object.keys(given)) {
      if (!(key in meta.fields)) throw new PluginStorageInvalid(`${meta.name}: unknown field "${key}".`);
    }
    return Object.fromEntries(meta.fieldNames.map((name) => [name, this.valueFor(meta, name, given[name])]));
  }

  private valueFor(meta: TableMeta, name: string, given: unknown): unknown {
    const field = meta.fields[name];
    const label = `${meta.name}.${name}`;
    if (given !== undefined) {
      const value = normalizeValue(label, field, given);
      if (field.generated && typeof value === 'number') this.state.observeCounter(meta.name, value);
      return value;
    }
    if (field.generated) return field.type === 'uuid' ? this.clock.uuid() : this.state.nextCounter(meta.name);
    return this.defaultFor(label, field);
  }

  private defaultFor(label: string, field: PluginStorageField): unknown {
    const fallback = field.default;
    if (fallback !== undefined) {
      if (fallback !== null && typeof fallback === 'object') return this.clock.now();
      return fallback === null ? null : normalizeValue(`${label} default`, field, fallback);
    }
    if (field.nullable) return null;
    throw new PluginStorageInvalid(`${label} is required.`);
  }

  /** Throws when `changed` repeats a unique key of another row in `rows` (a NULL in the key never conflicts). */
  private assertUnique(meta: TableMeta, rows: readonly Row[], changed: Row): void {
    for (const key of meta.uniqueKeys) {
      if (key.some((name) => changed[name] === null)) continue;
      const clash = rows.some(
        (other) => other !== changed && key.every((name) => valuesEqual(meta.fields[name], other[name], changed[name])),
      );
      if (clash) throw new PluginStorageUniqueViolation(`${meta.name}: the key (${key.join(', ')}) is already taken.`);
    }
  }

  update(table: string, where: unknown, patch: PluginStoragePatch<Row>): number {
    const meta = this.meta(table);
    const predicate = compileWhere(meta, where);
    const changes = this.compilePatch(meta, patch);
    return this.atomic(() => {
      let affected = 0;
      const rows = this.state.table(table).map((row) => {
        if (!matches(predicate, row)) return row;
        affected += 1;
        return changes(row);
      });
      this.state.setTable(table, rows);
      for (const row of rows) this.assertUnique(meta, rows, row);
      verifyReferences(this.metas, this.state, table);
      return affected;
    });
  }

  private compilePatch(meta: TableMeta, patch: unknown): (row: Row) => Row {
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
      throw new PluginStorageInvalid(`${meta.name}: a patch must be an object.`);
    }
    const entries = Object.entries(patch as Row).filter(([, value]) => value !== undefined);
    if (entries.length === 0) throw new PluginStorageInvalid(`${meta.name}: a patch needs at least one field.`);
    const apply = entries.map(([name, value]) => this.compileChange(meta, name, value));
    return (row) => Object.assign({}, row, ...apply.map((change) => change(row)));
  }

  private compileChange(meta: TableMeta, name: string, value: unknown): (row: Row) => Row {
    const field = meta.fields[name];
    const label = `${meta.name}.${name}`;
    if (!field) throw new PluginStorageInvalid(`${meta.name}: unknown field "${name}".`);
    if (field.generated) throw new PluginStorageInvalid(`${label} is generated and cannot be updated.`);
    if (!isIncrement(value)) {
      const normalized = normalizeValue(label, field, value);
      return () => ({ [name]: normalized });
    }
    if (field.type !== 'integer') throw new PluginStorageInvalid(`${label}: increment is for integer fields only.`);
    const by = normalizeValue(`${label} increment`, field, value.increment) as number;
    return (row) => {
      const current = row[name] as number | null;
      const next = current === null ? null : current + by;
      if (next !== null && !Number.isSafeInteger(next)) throw new PluginStorageInvalid(`${label} overflowed.`);
      return { [name]: next };
    };
  }

  remove(table: string, where: unknown): number {
    const meta = this.meta(table);
    const predicate = compileWhere(meta, where);
    return this.atomic(() => {
      const doomed = new Set(this.state.table(table).filter((row) => matches(predicate, row)));
      deleteWithReferences(this.metas, this.state, table, doomed);
      return doomed.size;
    });
  }

  upsert(table: string, input: unknown, conflictOn: readonly string[], update?: readonly string[]): Row {
    const meta = this.meta(table);
    this.assertConflictKey(meta, conflictOn);
    const refreshed =
      update ?? meta.fieldNames.filter((name) => !conflictOn.includes(name) && !meta.fields[name].generated);
    for (const name of refreshed) {
      if (!meta.fields[name] || meta.fields[name].generated || conflictOn.includes(name)) {
        throw new PluginStorageInvalid(`${meta.name}: "${name}" cannot be overwritten by an upsert.`);
      }
    }
    return this.atomic(() => {
      const candidate = this.buildRow(meta, input);
      const existing = this.state
        .table(table)
        .find((row) =>
          conflictOn.every((name) => row[name] !== null && valuesEqual(meta.fields[name], row[name], candidate[name])),
        );
      if (!existing) {
        this.append(meta, candidate);
        verifyReferences(this.metas, this.state, table);
        return candidate;
      }
      const merged: Row = { ...existing, ...Object.fromEntries(refreshed.map((name) => [name, candidate[name]])) };
      const rows = this.state.table(table).map((row) => (row === existing ? merged : row));
      this.assertUnique(meta, rows, merged);
      this.state.setTable(table, rows);
      verifyReferences(this.metas, this.state, table);
      return merged;
    });
  }

  private assertConflictKey(meta: TableMeta, conflictOn: readonly string[]): void {
    const known = meta.uniqueKeys.some(
      (key) => key.length === conflictOn.length && key.every((name) => conflictOn.includes(name)),
    );
    if (!known) {
      throw new PluginStorageInvalid(
        `${meta.name}: conflictOn (${conflictOn.join(', ')}) is not the primary key or a declared unique index.`,
      );
    }
  }

  /* ----------------------------------------------------------------------------------------------------- *
   * Reads
   * ----------------------------------------------------------------------------------------------------- */

  select(table: string, query: PluginStorageQuery<Row> = {}): Row[] {
    const meta = this.meta(table);
    const predicate = compileWhere(meta, query.where);
    const compare = compileOrder(meta, query.orderBy);
    const { limit, offset } = query;
    for (const [name, value] of [
      ['limit', limit],
      ['offset', offset],
    ] as const) {
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
        throw new PluginStorageInvalid(`${meta.name}: ${name} must be a non-negative integer.`);
      }
    }
    const found = this.state
      .table(table)
      .filter((row) => matches(predicate, row))
      .sort(compare);
    return found.slice(offset ?? 0, limit === undefined ? undefined : (offset ?? 0) + limit);
  }

  count(table: string, where: unknown): number {
    const predicate = compileWhere(this.meta(table), where);
    return this.state.table(table).filter((row) => matches(predicate, row)).length;
  }

  /** Row by primary key: a single value for a one-field key, an object for a composite key. */
  get(table: string, key: unknown): Row | null {
    const meta = this.meta(table);
    const pk = meta.primaryKey;
    const isObject = typeof key === 'object' && key !== null && !(key instanceof Date);
    if (!isObject && pk.length !== 1) {
      throw new PluginStorageInvalid(`${meta.name}: the primary key is composite; pass an object.`);
    }
    const where = (isObject ? key : { [pk[0]]: key }) as Row;
    const given = Object.keys(where);
    if (given.length !== pk.length || !pk.every((name) => given.includes(name))) {
      throw new PluginStorageInvalid(`${meta.name}: get needs exactly the primary key (${pk.join(', ')}).`);
    }
    return this.select(table, { where })[0] ?? null;
  }

  aggregate(table: string, field: string, where: unknown): AggregateResult {
    const meta = this.meta(table);
    const definition = meta.fields[field];
    if (!definition) throw new PluginStorageInvalid(`${meta.name}: cannot aggregate the unknown field "${field}".`);
    if (!['integer', 'decimal', 'timestamp', 'date'].includes(definition.type)) {
      throw new PluginStorageInvalid(`${meta.name}.${field}: aggregate is for numeric, date and timestamp fields.`);
    }
    const rows = this.select(table, { where: where as Row, orderBy: [{ field, direction: 'asc' }] });
    const values = rows.map((row) => row[field]).filter((value) => value !== null);
    const [min, max] = [values[0] ?? null, values[values.length - 1] ?? null];
    return {
      min: cloneValue(definition, min),
      max: cloneValue(definition, max),
      sum: this.sum(definition, values),
      count: rows.length,
    };
  }

  private sum(field: PluginStorageField, values: readonly unknown[]): number | string | null {
    if (values.length === 0 || (field.type !== 'integer' && field.type !== 'decimal')) return null;
    if (field.type === 'decimal') return sumDecimals(field, values);
    const total = (values as number[]).reduce((sum, value) => sum + value, 0);
    if (!Number.isSafeInteger(total)) throw new PluginStorageInvalid('The sum exceeds the safe integer range.');
    return total;
  }
}
