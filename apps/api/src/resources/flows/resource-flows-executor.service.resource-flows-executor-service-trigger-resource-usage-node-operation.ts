import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { UsageEventData } from './flow-execution.types';
import { ResourceFlowsExecutorServiceHandleResourceUsageOperation } from './resource-flows-executor.service.resource-flows-executor-service-handle-resource-usage-operation';
export abstract class ResourceFlowsExecutorServiceTriggerResourceUsageNodeOperation extends ResourceFlowsExecutorServiceHandleResourceUsageOperation {
  protected async triggerResourceUsageNode(
    resourceId: number,
    eventType: ResourceFlowNodeType,
    eventData: UsageEventData,
  ) {
    this.logger.debug(`Looking for flow nodes of type '${eventType}' for resource ID: ${resourceId}`);

    const eventNodes = await this.flowNodeRepository.find({
      where: {
        resourceId,
        type: eventType,
      },
    });

    if (eventNodes.length === 0) {
      this.logger.debug(`No flow nodes found for event type '${eventType}' and resource ID: ${resourceId}`);
      return;
    }

    this.logger.log(
      `Found ${eventNodes.length} flow node(s) for event type '${eventType}' and resource ID: ${resourceId}`,
    );

    await this.startFlow(eventNodes, { payload: eventData });
  }
}
