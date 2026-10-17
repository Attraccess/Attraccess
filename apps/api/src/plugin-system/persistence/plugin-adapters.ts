import type { PluginOperationAdapter, SqlitePluginRegistration } from '@attraccess/plugins-backend-sdk/adapter';
import type { PluginOperationToken, PluginPersistenceContext } from '@attraccess/plugins-backend-sdk/v2';
import { DataSource, EntityManager } from 'typeorm';

/** Each plugin owns an isolated registry; resolving a token never searches other plugins or Nest. */
export class SqlitePluginAdapters {
  private readonly adapters = new Map<symbol, PluginOperationAdapter>();

  constructor(
    registration: SqlitePluginRegistration | undefined,
    private readonly source: () => DataSource,
  ) {
    for (const adapter of registration?.operations ?? []) {
      if (this.adapters.has(adapter.token.id)) throw new Error('Duplicate plugin operation adapter.');
      if (!adapter.token.methods.length) throw new Error('Plugin operation methods must be declared.');
      this.adapters.set(adapter.token.id, adapter);
    }
  }

  /** Transaction scopes supply their manager and lifetime check; default resolution uses the host manager. */
  bind(manager?: EntityManager, assertOpen: () => void = () => undefined): PluginPersistenceContext {
    const proxies = new Map<symbol, object>();
    const instances = new Map<symbol, { source: DataSource; operations: object }>();
    return {
      resolve: <TOperations>(token: PluginOperationToken<TOperations>): TOperations => {
        assertOpen();
        const adapter = this.adapters.get(token.id);
        if (!adapter) throw new Error(`No adapter registered for plugin operation "${token.description}".`);
        if (!proxies.has(token.id)) {
          // Nest may construct plugin providers before injecting the host source.
          // Resolve only on use, and rebuild after the temporary configuration app closes.
          const operations = (): object => {
            assertOpen();
            const source = this.source();
            if (source.options.type !== 'sqlite' || (manager && manager.connection !== source)) {
              throw new Error('Plugin operation scope belongs to a different database backend or connection.');
            }
            if (!source.isInitialized) throw new Error('Plugin database connection is not ready.');
            const existing = instances.get(token.id);
            if (existing?.source === source) return existing.operations;
            const instance = adapter.create({
              backend: 'sqlite',
              dataSource: source,
              manager: manager ?? source.manager,
            });
            if (!instance || (typeof instance !== 'object' && typeof instance !== 'function')) {
              throw new Error('A plugin adapter must return an operation interface.');
            }
            instances.set(token.id, { source, operations: instance });
            return instance;
          };
          proxies.set(
            token.id,
            new Proxy(
              {},
              {
                set() {
                  throw new Error('Plugin operation interfaces are read-only.');
                },
                get(_, property) {
                  assertOpen();
                  if (!adapter.token.methods.includes(property)) return undefined;
                  const target = operations();
                  const value = Reflect.get(target, property, target);
                  if (typeof value !== 'function') throw new Error('Plugin operation interfaces expose methods only.');
                  return (...args: unknown[]) => {
                    assertOpen();
                    const current = operations();
                    return Reflect.apply(Reflect.get(current, property, current), current, args);
                  };
                },
              },
            ),
          );
        }
        return proxies.get(token.id) as TOperations;
      },
    };
  }
}
