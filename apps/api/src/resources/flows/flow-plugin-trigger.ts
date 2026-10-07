import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { MoreThan } from 'typeorm';
import { getPluginFlowNode, getPluginFlowNodeOwner } from '../../plugin-system/plugin-flow-node-registry';
import { FlowInputEventsImplementation } from './flow-input-events';
export abstract class FlowPluginTriggerImplementation extends FlowInputEventsImplementation {
  /**
   * Starts every plugin trigger node whose saved configuration matches an
   * external plugin event. Each node is started independently so its run logs
   * remain attributed to that node's resource.
   */
  public async triggerPluginFlows(
    pluginName: string,
    nodeType: string,
    matches: (config: Record<string, unknown>, nodeId: string) => boolean,
    payload: object,
  ): Promise<void> {
    const definition = getPluginFlowNode(nodeType);
    if (
      !nodeType.startsWith(`plugin.${pluginName}.`) ||
      !definition?.isInput ||
      getPluginFlowNodeOwner(nodeType) !== pluginName
    ) {
      throw new Error(`Plugin flow node type "${nodeType}" is not a registered trigger node.`);
    }

    const pageSize = 100;
    const concurrency = 10;
    let lastId: string | undefined;
    for (;;) {
      const nodes = await this.queuedPluginFlowLookup(() =>
        this.flowNodeRepository.find({
          where: {
            type: nodeType as ResourceFlowNodeType,
            ...(lastId ? { id: MoreThan(lastId) } : {}),
          },
          order: { id: 'ASC' },
          take: pageSize,
        }),
      );

      if (nodes.length === 0) return;
      lastId = nodes[nodes.length - 1].id;

      for (let offset = 0; offset < nodes.length; offset += concurrency) {
        await Promise.allSettled(
          nodes.slice(offset, offset + concurrency).map(async (node) => {
            let isMatch: boolean;
            try {
              isMatch = matches(node.data as Record<string, unknown>, node.id);
            } catch (error) {
              this.logger.error(
                `Failed to match plugin flow trigger node ID: ${node.id} (Type: ${nodeType})`,
                error instanceof Error ? error.stack : undefined,
              );
              return;
            }

            if (isMatch) {
              await this.startFlow(node, { payload });
            }
          }),
        );
      }

      if (nodes.length < pageSize) return;
    }
  }

  protected queuedPluginFlowLookup(lookup: () => Promise<ResourceFlowNode[]>): Promise<ResourceFlowNode[]> {
    const queued = this.pluginFlowLookupQueue.then(lookup, lookup);
    this.pluginFlowLookupQueue = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }
}
