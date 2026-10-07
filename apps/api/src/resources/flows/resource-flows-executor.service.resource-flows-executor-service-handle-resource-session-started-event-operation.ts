import { ResourceFlowNodeType, ResourceUsageAction } from '@attraccess/database-entities';
import { OnEvent } from '@nestjs/event-emitter';
import { ResourceSessionStartedEvent } from '../usage/events/resource-usage.events';
import { ResourceFlowsExecutorServiceCheckResourceActivityOperation } from './resource-flows-executor.service.resource-flows-executor-service-check-resource-activity-operation';
export abstract class ResourceFlowsExecutorServiceHandleResourceSessionStartedEventOperation extends ResourceFlowsExecutorServiceCheckResourceActivityOperation {
  @OnEvent(ResourceSessionStartedEvent.EVENT_NAME)
  async handleResourceSessionStartedEvent(event: ResourceSessionStartedEvent) {
    try {
      const { usage } = event;

      switch (usage.usageAction) {
        case ResourceUsageAction.Usage:
          // handled by the resource usage service
          break;
        case ResourceUsageAction.DoorLock:
          // TODO: directly trigger the flow instead of relying on the event emitter
          await this.handleResourceUsage(usage, ResourceFlowNodeType.INPUT_RESOURCE_DOOR_LOCKED);
          break;
        case ResourceUsageAction.DoorUnlock:
          // TODO: directly trigger the flow instead of relying on the event emitter
          await this.handleResourceUsage(usage, ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLOCKED);
          break;
        case ResourceUsageAction.DoorUnlatch:
          // TODO: directly trigger the flow instead of relying on the event emitter
          await this.handleResourceUsage(usage, ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLATCHED);
          break;

        default: {
          const exhaustiveCheck: never = usage.usageAction;
          throw new Error(`Unknown resource usage action: ${exhaustiveCheck}`);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to handle resource usage event`, error.stack);
      throw error;
    }
  }
}
