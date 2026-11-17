import { EntityManager } from 'typeorm';
import type { ScopedUnitOfWork, TransactionScope } from '../../unit-of-work';
import { TransactionScopeError } from '../../unit-of-work';
import type { ResourcePersistenceContext } from '../../../resources/resource-persistence-context';

/**
 * The entity manager a persistence call has to run on: the caller's transaction when a context is given, the
 * application connection otherwise. Accepts a unit-of-work scope and, for callers that have not migrated yet,
 * the engine's transaction handle itself.
 */
export function managerFor(
  context: ResourcePersistenceContext | undefined,
  fallback: EntityManager,
  unitOfWork?: ScopedUnitOfWork<EntityManager>,
): EntityManager {
  if (!context) return fallback;
  if (context instanceof EntityManager) return context;
  if (unitOfWork) return unitOfWork.handleOf(context as TransactionScope);
  throw new TransactionScopeError('No unit of work is available to resolve the transaction scope');
}
