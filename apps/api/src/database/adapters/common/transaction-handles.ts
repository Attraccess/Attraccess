import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ScopedUnitOfWork, TransactionScope, UNIT_OF_WORK } from '../../unit-of-work';

/** What an adapter accepts as "read through this transaction": a unit-of-work scope. */
export type TransactionContext = TransactionScope | object;

/**
 * Resolves the engine transaction behind a unit-of-work scope for the adapters. A raw EntityManager is still
 * accepted for callers that have not moved to the unit of work yet (audit); that shim goes away with them.
 */
@Injectable()
export class TransactionHandles {
  constructor(@Inject(UNIT_OF_WORK) private readonly unitOfWork: ScopedUnitOfWork<EntityManager>) {}

  managerOf(context: TransactionContext | undefined): EntityManager | undefined {
    if (!context) return undefined;
    if (typeof (context as Partial<EntityManager>).getRepository === 'function') return context as EntityManager;
    return this.unitOfWork.handleOf(context as TransactionScope);
  }
}
