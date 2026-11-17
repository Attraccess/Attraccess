import { PLUGIN_HOST_CONNECTION } from '../persistence/plugin-host-data.port';

/**
 * Plugins have no database access. These are the injection tokens that would hand one out: the TypeORM connection,
 * its managers and repositories, and the host connection token of the plugin runtime. `@nestjs/typeorm` names the
 * repository of an entity `<Entity>Repository`, and the default data source `DataSource`.
 */
const DATABASE_CLASS_NAMES = new Set(['DataSource', 'EntityManager', 'QueryRunner', 'Repository', 'Connection']);
const DATABASE_TOKEN_NAME = /^(DataSource|EntityManager|QueryRunner|Connection|.*Repository)$/;

/** Whether `token` would resolve a database handle of the host. */
export function isDatabaseToken(token: unknown): boolean {
  if (token === PLUGIN_HOST_CONNECTION) return true;
  if (typeof token === 'function') {
    // Matched by name along the prototype chain, so a class from another copy of typeorm and subclasses of
    // Repository are recognised without the host runtime importing the ORM.
    for (let klass: unknown = token; typeof klass === 'function'; klass = Object.getPrototypeOf(klass)) {
      if (DATABASE_CLASS_NAMES.has((klass as { name: string }).name)) return true;
    }
  }
  if (typeof token === 'string') return DATABASE_TOKEN_NAME.test(token);
  if (typeof token === 'symbol') return DATABASE_TOKEN_NAME.test(token.description ?? '');
  return false;
}

export function assertNotDatabaseToken(pluginName: string, token: unknown): void {
  if (isDatabaseToken(token)) {
    throw new Error(
      `Plugin "${pluginName}" asked for a database handle (${String(typeof token === 'function' ? token.name : token)}). ` +
        'Plugins keep data through context.storage (permission PLUGIN_STORAGE); the host connection is not available.',
    );
  }
}
