import { ModuleRef } from '@nestjs/core';
import { DATABASE_LIFECYCLE } from '../../database/database-lifecycle';
import { UNIT_OF_WORK } from '../../database/unit-of-work';
import { PLUGIN_CORE_LOOKUP, PLUGIN_HOST_CONNECTION, PLUGIN_HOST_DATA } from '../persistence/plugin-host-data.port';
import { PLUGIN_MIGRATION_GUIDE_URL } from './plugin-compatibility';

/**
 * Plugins have no database access. These are the injection tokens that would hand one out: the TypeORM connection,
 * its managers and repositories, the unit of work (its scopes unwrap to the entity manager), the database lifecycle
 * (the connection itself), the persistence adapters' transaction access, the host-data ports behind the permission
 * checks of `context.hostData`, and ModuleRef, which resolves every host provider. `@nestjs/typeorm` names the
 * repository of an entity `<Entity>Repository`, and the default data source `DataSource`.
 */
const DATABASE_CLASS_NAMES = new Set([
  'DataSource',
  'EntityManager',
  'QueryRunner',
  'Repository',
  'Connection',
  'ModuleRef',
  // The providers PersistenceCoreModule exports beside UNIT_OF_WORK (named here: runtime code may not import the
  // adapters; module-injection.persistence.spec checks that every export of the module is denied).
  'TransactionHandles',
  'TransactionContextResolver',
  'EntityManagerResolver',
]);
const DATABASE_TOKEN_NAME = /^(DataSource|EntityManager|QueryRunner|Connection|ModuleRef|.*Repository)$/;
/** Classes whose instances are database handles, whatever token resolved them. */
const HANDLE_CLASS_NAMES = new Set([...DATABASE_CLASS_NAMES, 'ScopedUnitOfWork']);

/** Host tokens denied by identity. */
const DENIED_TOKENS: ReadonlySet<unknown> = new Set<unknown>([
  PLUGIN_HOST_CONNECTION,
  PLUGIN_HOST_DATA,
  PLUGIN_CORE_LOOKUP,
  UNIT_OF_WORK,
  DATABASE_LIFECYCLE,
  ModuleRef,
]);

function hasClassNamed(klass: unknown, names: ReadonlySet<string>): boolean {
  // Matched by name along the prototype chain, so a class from another copy of typeorm and subclasses of
  // Repository are recognised.
  for (let current = klass; typeof current === 'function'; current = Object.getPrototypeOf(current)) {
    if (names.has((current as { name: string }).name)) return true;
  }
  return false;
}

/** Whether `token` would resolve a database handle of the host. */
export function isDatabaseToken(token: unknown): boolean {
  if (DENIED_TOKENS.has(token)) return true;
  if (typeof token === 'function') return hasClassNamed(token, DATABASE_CLASS_NAMES);
  if (typeof token === 'string') return DATABASE_TOKEN_NAME.test(token);
  if (typeof token === 'symbol') return DATABASE_TOKEN_NAME.test(token.description ?? '');
  return false;
}

/** Whether a resolved provider is itself a database handle (a connection, manager, runner or unit of work). */
export function isDatabaseHandle(instance: unknown): boolean {
  return typeof instance === 'object' && instance !== null && hasClassNamed(instance.constructor, HANDLE_CLASS_NAMES);
}

const tokenLabel = (token: unknown): string => String(typeof token === 'function' ? token.name : token);

/** The refusal of a plugin that reaches for the database: names the plugin, what it asked for and the guide. */
export function databaseAccessRefusal(pluginName: string, verb: string, token: unknown): Error {
  return new Error(
    `Plugin "${pluginName}" ${verb} a database handle (${tokenLabel(token)}). Plugins keep data through ` +
      'context.storage (permission PLUGIN_STORAGE); the host connection is not available. ' +
      `Migration guide: ${PLUGIN_MIGRATION_GUIDE_URL}`,
  );
}

export function assertNotDatabaseToken(pluginName: string, token: unknown): void {
  if (isDatabaseToken(token)) throw databaseAccessRefusal(pluginName, 'asked for', token);
}

/** Refuses a provider `context.get` resolved that turns out to be a database handle under an innocent token. */
export function assertNotDatabaseHandle<T>(pluginName: string, token: unknown, instance: T): T {
  if (isDatabaseHandle(instance)) throw databaseAccessRefusal(pluginName, 'asked for', token);
  return instance;
}
