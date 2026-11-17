import type { EntityManager } from 'typeorm';
import type { ScopedUnitOfWork } from '../../unit-of-work';
import { TransactionScopeError } from '../../unit-of-work';
import type { ResourcePersistenceContext } from '../../../resources/resource-persistence-context';
import { engineTransactionOf } from '../common/legacy-engine-transaction';

/**
 * The entity manager a persistence call has to run on: the caller's transaction when a context is given, the
 * application connection otherwise.
 */
export function managerFor(
  context: ResourcePersistenceContext | undefined,
  fallback: EntityManager,
  unitOfWork?: ScopedUnitOfWork<EntityManager>,
): EntityManager {
  if (!context) return fallback;
  const engineTransaction = engineTransactionOf(context);
  if (engineTransaction) return engineTransaction;
  if (unitOfWork) return unitOfWork.handleOf(context);
  throw new TransactionScopeError('No unit of work is available to resolve the transaction scope');
}
