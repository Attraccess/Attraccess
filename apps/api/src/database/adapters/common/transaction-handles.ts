import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ScopedUnitOfWork, TransactionScope, UNIT_OF_WORK } from '../../unit-of-work';
import { engineTransactionOf } from './legacy-engine-transaction';

/** What an adapter accepts as "read through this transaction": a unit-of-work scope. */
export type TransactionContext = TransactionScope;

/** Resolves the engine transaction behind a unit-of-work scope for the adapters. */
@Injectable()
export class TransactionHandles {
  constructor(@Inject(UNIT_OF_WORK) private readonly unitOfWork: ScopedUnitOfWork<EntityManager>) {}

  managerOf(context: TransactionContext | undefined): EntityManager | undefined {
    if (!context) return undefined;
    return engineTransactionOf(context) ?? this.unitOfWork.handleOf(context);
  }
}
