import { InsertQueryBuilder } from 'typeorm';

/**
 * TypeORM leaves an auto-increment primary key out of every PostgreSQL INSERT, even when the entity carries a value
 * (only SQL Server honours one), so a spec that saves `{ id: 10 }` would get the next sequence value instead. The
 * production code never sets such ids; specs do to keep fixtures readable. This makes the INSERT honour them in tests.
 * The column's sequence is moved past the explicit values afterwards, so a later generated id does not collide.
 */
type InsertInternals = {
  connection: { query(sql: string, parameters?: unknown[]): Promise<Array<Record<string, unknown>>> };
  getValueSets(): Array<Record<string, unknown>>;
  execute(): Promise<unknown>;
  getInsertedColumns(): Array<{
    isPrimary: boolean;
    isGenerated: boolean;
    generationStrategy?: string;
    databaseName: string;
    getEntityValue(entity: Record<string, unknown>): unknown;
  }>;
  isOverridingAutoIncrementBehavior(column: unknown): boolean;
  expressionMap: {
    mainAlias?: { metadata: { columns: unknown[]; tablePath: string } };
    queryRunner?: { query(sql: string, parameters?: unknown[]): Promise<Array<Record<string, unknown>>> };
  };
};

const prototype = InsertQueryBuilder.prototype as unknown as InsertInternals & { __explicitKeys?: true };

if (!prototype.__explicitKeys) {
  prototype.__explicitKeys = true;
  const original = prototype.getInsertedColumns;
  prototype.getInsertedColumns = function (this: InsertInternals) {
    const columns = original.call(this);
    let metadata: { columns: unknown[] } | undefined;
    try {
      metadata = this.expressionMap.mainAlias?.metadata;
    } catch {
      return columns; // a table without an entity (the migrations table)
    }
    if (!metadata) return columns;
    const explicit = (metadata.columns as typeof columns).filter(
      (column) => !columns.includes(column) && this.isOverridingAutoIncrementBehavior(column),
    );
    return explicit.length
      ? (metadata.columns as typeof columns).filter((c) => columns.includes(c) || explicit.includes(c))
      : columns;
  };

  const execute = prototype.execute;
  prototype.execute = async function (this: InsertInternals, ...args: []) {
    // The explicit ids are read before the INSERT: afterwards the generated ones are in the value sets as well.
    const explicitIds = new Map<string, number[]>();
    try {
      const metadata = this.expressionMap.mainAlias?.metadata;
      if (metadata) {
        for (const column of (metadata.columns as ReturnType<InsertInternals['getInsertedColumns']>).filter((c) =>
          this.isOverridingAutoIncrementBehavior(c),
        )) {
          const ids = this.getValueSets()
            .map((valueSet) => Number(column.getEntityValue(valueSet)))
            .filter(Number.isFinite);
          if (ids.length) explicitIds.set(column.databaseName, ids);
        }
      }
    } catch {
      // A table without an entity: nothing explicit.
    }
    const result = await execute.apply(this, args);
    if (explicitIds.size === 0) return result;
    // Asked on the query runner of the INSERT, not on a second pooled connection: a transaction holding row locks
    // that waits for another connection starves the pool under parallel specs.
    const runner = this.expressionMap.queryRunner ?? this.connection;
    try {
      const metadata = this.expressionMap.mainAlias?.metadata;
      if (metadata) {
        for (const [databaseName, ids] of explicitIds) {
          const column = { databaseName };
          const [{ sequence }] = await runner.query('SELECT pg_get_serial_sequence($1, $2) AS sequence', [
            metadata.tablePath.includes('.')
              ? metadata.tablePath.replace(/^([^.]+)\.(.+)$/, '"$1"."$2"')
              : `"${metadata.tablePath}"`,
            column.databaseName,
          ]);
          if (!sequence) continue;
          await runner.query(
            `SELECT setval($1::regclass, GREATEST($2::bigint, (SELECT last_value FROM ${sequence})))`,
            [sequence, Math.max(...ids)],
          );
        }
      }
    } catch {
      // Not a sequence-backed table (or no connection to ask): nothing to move.
    }
    return result;
  };
}
