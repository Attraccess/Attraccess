import { ResourceFlowNodeType, ResourceUsage } from '@attraccess/database-entities';
import { ResourceFlowsExecutorServiceHandleResourceSessionStartedEventOperation } from './resource-flows-executor.service.resource-flows-executor-service-handle-resource-session-started-event-operation';
export abstract class ResourceFlowsExecutorServiceHandleResourceUsageOperation extends ResourceFlowsExecutorServiceHandleResourceSessionStartedEventOperation {
  protected async handleResourceUsage(usage: ResourceUsage, inputType: ResourceFlowNodeType) {
    const { resource } = usage;

    this.logger.log(`Handling resource usage event for resource ID: ${resource.id}`);

    try {
      await this.triggerResourceUsageNode(resource.id, inputType, {
        event: {
          timestamp: (usage.endTime ?? usage.startTime)?.toISOString(),
        },
        usage: {
          start: usage.startTime.toISOString(),
          end: usage.endTime ? usage.endTime.toISOString() : null,
        },
        user: {
          id: usage.user.id,
          username: usage.user.username,
          externalIdentifier: usage.user.externalIdentifier,
        },
        resource: {
          id: usage.resource.id,
          name: usage.resource.name,
          metadata: usage.resource.metadata ?? null,
        },
      });
      this.logger.log(`Successfully processed resource usage event for resource ID: ${resource.id}`);
    } catch (error) {
      this.logger.error(`Failed to handle resource usage event for resource ID: ${resource.id}`, error.stack);
      throw error;
    }
  }
}
