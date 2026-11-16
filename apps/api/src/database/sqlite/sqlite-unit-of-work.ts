import { DataSource, EntityManager } from 'typeorm';
import { ScopedUnitOfWork } from '../unit-of-work';
import { runSerializedTransaction } from './run-serialized-transaction';

/**
 * The SQLite unit of work: transactions run on the dedicated resource-lifecycle connection, one at a time (SQLite
 * has a single writer). This serialization is an adapter detail; the UnitOfWork contract promises only atomicity
 * and isolation per unit, not a global lock.
 */
export function createSqliteUnitOfWork(source: DataSource): ScopedUnitOfWork<EntityManager> {
  return new ScopedUnitOfWork<EntityManager>({
    transaction: (work) => runSerializedTransaction(source.manager, work),
  });
}
