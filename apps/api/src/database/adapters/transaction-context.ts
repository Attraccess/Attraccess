import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ScopedUnitOfWork, TransactionScope, UNIT_OF_WORK } from '../unit-of-work';

/**
 * Turns the transaction a caller hands to a store into the TypeORM manager to write with, and runs a store's own
 * atomic units. A `TransactionScope` of the application's unit of work is unwrapped; the manager of a caller that
 * is not migrated to scopes yet is used as it is.
 */
@Injectable()
export class TransactionContextResolver {
  constructor(
    @InjectDataSource() private readonly source: DataSource,
    @Inject(UNIT_OF_WORK) private readonly uow: ScopedUnitOfWork<EntityManager>,
  ) {}

  /** The manager for reads and single writes: the caller's transaction, else the shared connection. */
  manager(context?: TransactionScope | object): EntityManager {
    if (!context) return this.source.manager;
    if (typeof (context as EntityManager).getRepository === 'function') return context as EntityManager;
    return this.uow.handleOf(context as TransactionScope);
  }

  /** Runs `work` in the caller's transaction, or in one of its own when the caller has none. */
  run<T>(context: TransactionScope | object | undefined, work: (manager: EntityManager) => Promise<T>): Promise<T> {
    if (context) return work(this.manager(context));
    return this.uow.run((scope) => work(this.uow.handleOf(scope)));
  }
}
