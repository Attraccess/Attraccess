import type { Row } from './values';

export interface Snapshot {
  readonly rows: ReadonlyMap<string, readonly Row[]>;
  readonly counters: ReadonlyMap<string, number>;
}

/**
 * Committed rows and generated-key counters. Stored rows are never mutated, so a snapshot is a cheap copy of the row
 * lists, and a rollback is putting them back.
 */
export class StorageState {
  private rows = new Map<string, Row[]>();
  private counters = new Map<string, number>();

  constructor(tableNames: Iterable<string>) {
    for (const name of tableNames) this.rows.set(name, []);
  }

  table(name: string): readonly Row[] {
    return this.rows.get(name) ?? [];
  }

  setTable(name: string, rows: Row[]): void {
    this.rows.set(name, rows);
  }

  /** Next value of a generated integer key. */
  nextCounter(table: string): number {
    const next = (this.counters.get(table) ?? 0) + 1;
    this.counters.set(table, next);
    return next;
  }

  /** An explicit key value moves the counter past it, so generated keys never collide with explicit ones. */
  observeCounter(table: string, value: number): void {
    this.counters.set(table, Math.max(this.counters.get(table) ?? 0, value));
  }

  snapshot(): Snapshot {
    return {
      rows: new Map([...this.rows].map(([name, rows]) => [name, rows.slice()])),
      counters: new Map(this.counters),
    };
  }

  /** A separate state holding a snapshot (the committed rows while a transaction runs). */
  static of(snapshot: Snapshot): StorageState {
    const state = new StorageState([]);
    state.restore(snapshot);
    return state;
  }

  restore(snapshot: Snapshot): void {
    this.rows = new Map([...snapshot.rows].map(([name, rows]) => [name, rows.slice()]));
    this.counters = new Map(snapshot.counters);
  }

  clear(): void {
    for (const name of this.rows.keys()) this.rows.set(name, []);
    this.counters.clear();
  }
}
