/**
 * Module-level singleton registry for plugin-contributed flow nodes.
 *
 * Populated during AppModule initialisation (PluginModule.forRoot), before the
 * NestJS DI container starts — the same pattern used by dataSourceConfig.entities.
 * Services that need the list import getRegisteredPluginFlowNodes() directly.
 */

import type { PluginFlowNodeDefinition } from '@attraccess/plugins-backend-sdk';

const _nodes: PluginFlowNodeDefinition[] = [];

/** Called by PluginModule once per plugin that declares flowNodes. */
export function registerPluginFlowNodes(nodes: PluginFlowNodeDefinition[]): void {
  _nodes.push(...nodes);
}

/** Returns all plugin-registered flow node definitions. */
export function getRegisteredPluginFlowNodes(): PluginFlowNodeDefinition[] {
  return _nodes;
}
