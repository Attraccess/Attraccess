import type { EntityManager } from 'typeorm';
import { TransactionScopeError, type TransactionScope } from '../../unit-of-work';

const ENGINE_TRANSACTION = Symbol('attraccess.legacy-engine-transaction');

/**
 * LEGACY, adapter layer only: a `TransactionScope` view of a TypeORM transaction an adapter opened itself, so that
 * it can hand that transaction to ports that take scopes (the audit recorder, and the settings it reads). Ports never
 * name this type. Remaining users, which still open a TypeORM transaction themselves: the SSO provider store, the
 * maintenance schedule store, the email template store (`dataSource.transaction`) and the maintenance evaluation
 * snapshot reader (its own read connection). It goes away once they run on the unit of work.
 */
export interface LegacyEngineTransactionScope extends TransactionScope {
  readonly [ENGINE_TRANSACTION]: EntityManager;
}

/** Wraps the transaction an adapter opened itself. Post-commit work is not available on it. */
export function legacyEngineTransactionScope(manager: EntityManager): LegacyEngineTransactionScope {
  return {
    get isOpen() {
      return manager.queryRunner?.isTransactionActive ?? false;
    },
    afterCommit() {
      throw new TransactionScopeError('Post-commit work is not available on a transaction an adapter opened itself');
    },
    [ENGINE_TRANSACTION]: manager,
  };
}

/** The adapter-opened transaction behind a legacy scope, undefined for a scope of the unit of work. */
export function engineTransactionOf(scope: TransactionScope): EntityManager | undefined {
  return (scope as Partial<LegacyEngineTransactionScope>)[ENGINE_TRANSACTION];
}
