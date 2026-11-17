import type { EntityManager } from 'typeorm';
import { createHostTransactionScope } from '@attraccess/plugins-backend-sdk/sqlite';
import type { PluginTransactionScope } from '@attraccess/plugins-backend-sdk';
import { resolveDatabaseBackend } from '../../backend';
import type { DatabaseType } from '../../backend/database-backend';
import { ScopedUnitOfWork, TransactionScopeError, type TransactionScope, type UnitOfWork } from '../../unit-of-work';

const SCOPES: Record<DatabaseType, (unitOfWork: UnitOfWork, scope: TransactionScope) => PluginTransactionScope> = {
  sqlite: (unitOfWork, scope) => {
    if (!(unitOfWork instanceof ScopedUnitOfWork)) {
      throw new TransactionScopeError('The unit of work is not backed by the SQLite adapter');
    }
    return createHostTransactionScope((unitOfWork as ScopedUnitOfWork<EntityManager>).handleOf(scope));
  },
};

/**
 * The scope plugin hooks receive for a unit of work the host opened itself (the serialized start transaction of a
 * session). The plugin reads through it with its engine subpath; it cannot commit it or defer work onto it.
 */
export function pluginScopeOfHostTransaction(unitOfWork: UnitOfWork, scope: TransactionScope): PluginTransactionScope {
  return SCOPES[resolveDatabaseBackend().type](unitOfWork, scope);
}
