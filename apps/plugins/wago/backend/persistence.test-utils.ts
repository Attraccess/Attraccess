import type { PluginFlowNodeQuery, PluginFlowNodeReference, PluginHostDataContext } from '@attraccess/plugins-backend-sdk';

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
