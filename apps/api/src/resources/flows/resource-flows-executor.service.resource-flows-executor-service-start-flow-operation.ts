import { EntityManager } from 'typeorm';
import { ResourceFlowNode } from '@attraccess/database-entities';
import { NodeProcessingResult } from './node-executors';
import { FlowExecutionOptions, FlowResourceContext } from './flow-execution.types';
import { ResourceFlowsExecutorServiceTriggerPluginFlowsOperation } from './resource-flows-executor.service.resource-flows-executor-service-trigger-plugin-flows-operation';
export abstract class ResourceFlowsExecutorServiceStartFlowOperation extends ResourceFlowsExecutorServiceTriggerPluginFlowsOperation {
  public async startFlow(
    node: ResourceFlowNode | ResourceFlowNode[],
    data: NodeProcessingResult,
    transactionManager?: EntityManager,
    resourceContextCache: Map<number, FlowResourceContext> = new Map(),
    options: FlowExecutionOptions = {},
  ): Promise<NodeProcessingResult[]> {
    return this.engine.startFlow(node, data, transactionManager, resourceContextCache, options);
  }
}
