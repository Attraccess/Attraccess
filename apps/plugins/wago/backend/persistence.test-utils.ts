import type {
  PluginFlowNodeQuery,
  PluginFlowNodeReference,
  PluginHostDataContext,
  PluginPersistenceContext,
} from '@attraccess/plugins-backend-sdk';
import { createSqlitePluginPersistence, type DataSource } from '@attraccess/plugins-backend-sdk/sqlite';

/** Accepts every entity class: test doubles do not declare `persistence.sqlite.entities`. */
const ANY_ENTITY = { includes: () => true } as unknown as unknown[];

/** The plugin persistence context over a real database (or any object with the repository accessors). */
export function persistenceOver(source: unknown): PluginPersistenceContext {
  return createSqlitePluginPersistence({
    pluginName: 'wago',
    connection: () => source as DataSource,
    entities: ANY_ENTITY,
  });
}

/** The persistence context over repositories a test fakes: `getRepository(entity)` answers with the fake. */
export function persistenceFaking(getRepository: (entity: never) => unknown): PluginPersistenceContext {
  return persistenceOver({ getRepository });
}

const unavailable = (name: string) => () => {
  throw new Error(`${name} is not faked by this test`);
};

/** Host data whose flow lookup answers from the given function; everything else fails loudly. */
export function hostDataWithFlows(
  findNodes: (query: PluginFlowNodeQuery) => PluginFlowNodeReference[] | Promise<PluginFlowNodeReference[]>,
): PluginHostDataContext {
  return {
    resources: new Proxy({}, { get: (_, name) => unavailable(`hostData.resources.${String(name)}`) }) as never,
    users: new Proxy({}, { get: (_, name) => unavailable(`hostData.users.${String(name)}`) }) as never,
    settings: new Proxy({}, { get: (_, name) => unavailable(`hostData.settings.${String(name)}`) }) as never,
    flows: { findNodes: async (query) => findNodes(query) },
  };
}

/** A flow node as the host lookup returns it. */
export function flowNode(overrides: Partial<PluginFlowNodeReference> & Pick<PluginFlowNodeReference, 'id'>) {
  return {
    type: 'plugin.wago.command',
    resourceId: null,
    resourceName: null,
    flowId: null,
    flowName: null,
    data: {},
    ...overrides,
  } as PluginFlowNodeReference;
}

/**
 * Context members for a test that fakes repositories: `persistence` serves them to the code under test, and the
 * given `getRepository` spy stays on the context so the test can assert on or re-program the lookups.
 */
export function repositoryDouble<T extends (entity: never) => unknown>(getRepository: T) {
  return { getRepository, persistence: persistenceFaking(getRepository) };
}
