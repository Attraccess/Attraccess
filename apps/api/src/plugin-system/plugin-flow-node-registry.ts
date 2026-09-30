/**
 * Module-level singleton registry for plugin-contributed flow nodes.
 *
 * Populated during AppModule initialisation (PluginModule.forRoot), before the
 * NestJS DI container starts — the same pattern used by dataSourceConfig.entities.
 * Services that need the list import getRegisteredPluginFlowNodes() directly.
 */

import type { PluginFlowNodeDefinition } from '@attraccess/plugins-backend-sdk';

// ponytail: Map keyed by type for O(1) lookup; registration order preserved via insertion order.
interface RegisteredPluginFlowNode {
  definition: PluginFlowNodeDefinition;
  pluginName: string;
}

const _nodesMap = new Map<string, RegisteredPluginFlowNode>();

/** Called by PluginModule once per plugin that declares flowNodes. */
export function registerPluginFlowNodes(pluginName: string, nodes: PluginFlowNodeDefinition[]): void {
  for (const node of nodes) {
    if (_nodesMap.has(node.type)) {
      throw new Error(
        `Plugin flow node type "${node.type}" is already registered. ` +
          `Node types must be unique across all plugins.`,
      );
    }
    _nodesMap.set(node.type, { definition: node, pluginName });
  }
}

/** O(1) lookup of a single plugin-registered flow node definition by type. */
export function getPluginFlowNode(type: string): PluginFlowNodeDefinition | undefined {
  return _nodesMap.get(type)?.definition;
}

/** Returns the plugin that registered a flow node type. */
export function getPluginFlowNodeOwner(type: string): string | undefined {
  return _nodesMap.get(type)?.pluginName;
}

/** Returns all plugin-registered flow node definitions. */
export function getRegisteredPluginFlowNodes(): PluginFlowNodeDefinition[] {
  return Array.from(_nodesMap.values(), ({ definition }) => definition);
}
