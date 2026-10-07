import { EntityManager } from 'typeorm';
import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { FlowExecutionOptions } from './flow-execution.types';
import { getFlowRepository } from './flow-execution-context';
import { ResourceFlowsExecutorServiceTriggerResourceUsageNodeOperation } from './resource-flows-executor.service.resource-flows-executor-service-trigger-resource-usage-node-operation';
export abstract class ResourceFlowsExecutorServiceRunFlowOperation extends ResourceFlowsExecutorServiceTriggerResourceUsageNodeOperation {
  public async runFlow(
    resourceId: number,
    triggerNodeType: ResourceFlowNodeType,
    initialData: object = {},
    transactionManager?: EntityManager,
    options: FlowExecutionOptions = {},
  ): Promise<object[]> {
    const repository = getFlowRepository(ResourceFlowNode, this.flowNodeRepository, transactionManager);

    const allNodes = await repository.find({
      where: {
        resourceId,
        type: triggerNodeType,
      },
    });

    const nodes = options.metering
      ? allNodes.filter((node) => node.data?.meterId === options.metering?.meterId)
      : allNodes;
    if (nodes.length === 0) {
      this.logger.debug(
        `No flow nodes found for trigger node type '${triggerNodeType}' and resource ID: ${resourceId}`,
      );
      return [];
    }

    // TODO: propagate errors so when calling runFlow you can react to them and they dont get ignored
    const results = await this.startFlow(nodes, { payload: initialData }, transactionManager, new Map(), options);
    return results.map((r) => r.payload);
  }
}
