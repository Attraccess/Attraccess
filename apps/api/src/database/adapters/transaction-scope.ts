import type { DataSource, EntityManager } from 'typeorm';
import { ScopedUnitOfWork, type TransactionScope, type UnitOfWork } from '../unit-of-work';

/**
 * The entity manager an adapter writes with: the manager of the open unit of work when a scope is given, the
 * application connection otherwise.
 */
export function managerFor(source: DataSource, uow: UnitOfWork, scope?: TransactionScope): EntityManager {
  if (!scope) return source.manager;
  if (uow instanceof ScopedUnitOfWork) return (uow as ScopedUnitOfWork<EntityManager>).handleOf(scope);
  throw new Error('This unit of work is not backed by the TypeORM adapter');
}
