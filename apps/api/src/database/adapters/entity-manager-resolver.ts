import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { engineTransactionOf } from './common/legacy-engine-transaction';
import type { TransactionContext } from '../transaction-context';
import { ScopedUnitOfWork, UNIT_OF_WORK, UnitOfWork } from '../unit-of-work';

/**
 * Adapter-side interpretation of a {@link TransactionContext}. A scope of the unit of work resolves to its
 * transaction's EntityManager (an adapter's own legacy transaction resolves to itself), and no context
 * resolves to the manager of the unit of work still open in this async flow, or to the application connection for
 * plain reads. A continuation that outlives its unit of work (post-commit work started inside it) still sees the
 * closed scope as current; it reads through the application connection instead of failing on the closed scope.
 */
@Injectable()
export class EntityManagerResolver {
  private readonly uow: ScopedUnitOfWork<EntityManager>;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @InjectDataSource() private readonly source: DataSource,
  ) {
    this.uow = uow as ScopedUnitOfWork<EntityManager>;
  }

  resolve(context?: TransactionContext): EntityManager {
    if (context) return engineTransactionOf(context) ?? this.uow.handleOf(context);
    const current = this.uow.current();
    return current?.isOpen ? this.uow.handleOf(current) : this.source.manager;
  }
}
