import type { DataSource, EntityManager } from 'typeorm';
import { ScopedUnitOfWork } from '../unit-of-work';

/**
 * The PostgreSQL unit of work: one real transaction per unit (READ COMMITTED) on its own pooled connection. Nothing
 * is serialised in the process; concurrent units run in parallel and rely on row locks, advisory locks and
 * constraints (see docs/en/developer/persistence-guarantees.md).
 */
export function createPostgresUnitOfWork(source: DataSource): ScopedUnitOfWork<EntityManager> {
  return new ScopedUnitOfWork<EntityManager>({
    transaction: (work) => source.manager.transaction(work),
  });
}
