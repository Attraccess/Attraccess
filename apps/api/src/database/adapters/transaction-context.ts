import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ScopedUnitOfWork, TransactionScope, UNIT_OF_WORK } from '../unit-of-work';
import { engineTransactionOf } from './common/legacy-engine-transaction';

/**
 * Turns the transaction a caller hands to a store into the TypeORM manager to write with, and runs a store's own
 * atomic units. A `TransactionScope` of the application's unit of work is unwrapped.
 */
@Injectable()
export class TransactionContextResolver {
  constructor(
    @InjectDataSource() private readonly source: DataSource,
    @Inject(UNIT_OF_WORK) private readonly uow: ScopedUnitOfWork<EntityManager>,
  ) {}

  /** The manager for reads and single writes: the caller's transaction, else the shared connection. */
  manager(context?: TransactionScope): EntityManager {
    if (!context) return this.source.manager;
    return engineTransactionOf(context) ?? this.uow.handleOf(context);
  }

  /** Runs `work` in the caller's transaction, or in one of its own when the caller has none. */
  run<T>(
    context: TransactionScope | undefined,
    work: (manager: EntityManager, scope: TransactionScope) => Promise<T>,
  ): Promise<T> {
    if (context) return work(this.manager(context), context);
    return this.uow.run((scope) => work(this.uow.handleOf(scope), scope));
  }
}
