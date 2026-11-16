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

/**
 * The transaction handle the audit recorder writes its row with, so the row commits or rolls back with the unit of
 * work. Undefined for a unit of work that is not an engine transaction (unit tests with fakes).
 * Replace with the scope itself once the audit recorder accepts a TransactionScope.
 */
export function auditTransactionOf(uow: UnitOfWork, scope: TransactionScope): EntityManager | undefined {
  return uow instanceof ScopedUnitOfWork ? (uow as ScopedUnitOfWork<EntityManager>).handleOf(scope) : undefined;
}
