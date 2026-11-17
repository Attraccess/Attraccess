import type { EntityManager } from 'typeorm';
import { createHostTransactionScope } from '@attraccess/plugins-backend-sdk/sqlite';
import type { PluginTransactionScope } from '@attraccess/plugins-backend-sdk';
import { resolveDatabaseBackend } from '../../backend';
import type { DatabaseType } from '../../backend/database-backend';

const SCOPES: Record<DatabaseType, (transaction: object) => PluginTransactionScope> = {
  sqlite: (transaction) => createHostTransactionScope(transaction as EntityManager),
};

/**
 * The scope plugin hooks receive for a transaction the host opened itself (the serialized start transaction of a
 * session). The plugin reads through it with its engine subpath; it cannot commit it or defer work onto it.
 */
export function pluginScopeOfHostTransaction(transaction: object): PluginTransactionScope {
  return SCOPES[resolveDatabaseBackend().type](transaction);
}
