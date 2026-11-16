import { FlowScope } from '@attraccess/database-entities';
import { getPluginFlowNode } from '../../../plugin-system/flows/node-registry';
import { getCoreNodeFlowScopes } from './core-node-schemas';

/** Plugin nodes are resource-only until they opt in. */
const DEFAULT_PLUGIN_FLOW_SCOPES: readonly FlowScope[] = ['resource'];

/** The flow scopes a node type (core or plugin) can be used in; undefined for unknown types. */
export function getNodeFlowScopes(type: string): FlowScope[] | undefined {
  const core = getCoreNodeFlowScopes(type);
  if (core) return core;
  const plugin = getPluginFlowNode(type);
  return plugin ? [...(plugin.flowScopes ?? DEFAULT_PLUGIN_FLOW_SCOPES)] : undefined;
}
