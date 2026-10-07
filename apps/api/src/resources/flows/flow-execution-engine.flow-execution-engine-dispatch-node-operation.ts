import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { EntityManager } from 'typeorm';
import { getPluginFlowNode } from '../../plugin-system/plugin-flow-node-registry';
import { NodeProcessingResult } from './node-executors';
import { FlowExecutionOptions } from './flow-execution.types';
import { FlowExecutionEngineStartFlowOperation } from './flow-execution-engine.flow-execution-engine-start-flow-operation';
export abstract class FlowExecutionEngineDispatchNodeOperation extends FlowExecutionEngineStartFlowOperation {
  protected async dispatchNode(
    flowRunId: string,
    node: ResourceFlowNode,
    input: object,
    transactionManager?: EntityManager,
    options: FlowExecutionOptions = {},
  ): Promise<NodeProcessingResult> {
    // Core node types are looked up in the exhaustive record.
    const executor = this.nodeExecutors[node.type as ResourceFlowNodeType];
    if (executor) {
      return executor.execute(node, input, this.context.buildExecutionContext(flowRunId, transactionManager, options));
    }

    // Plugin-contributed node types fall through to the plugin registry.
    const pluginNode = getPluginFlowNode(node.type);
    if (pluginNode) {
      if (pluginNode.isInput) {
        return { payload: input, outputHandle: 'output' };
      }
      return pluginNode.execute(
        { id: node.id, type: node.type, data: node.data as Record<string, unknown> },
        input,
        this.context.buildExecutionContext(flowRunId, transactionManager, options),
      );
    }

    throw new Error(`No executor found for flow node type: ${node.type}`);
  }
}
