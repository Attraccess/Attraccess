import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceFlowNodeType, ResourceMaintenance, ResourceMaintenanceRequest } from '@attraccess/database-entities';
import { ResourceHealthChangedEvent } from '../../health/events/resource-health-changed.event';
import { ResourceMaintenanceChangedEvent } from '../../maintenances/events/resource-maintenance-changed.event';
import { ResourceMaintenanceRequestCreatedEvent } from '../../maintenances/events/maintenance-request-created.event';
import { ResourceFlowsExecutorService } from './resource-flows-executor.service';

/**
 * Starts the flows of health and maintenance events: the resource's own flow and every enabled global flow.
 * The engine adds the `resource` object to the payload.
 */
@Injectable()
export class FlowEventTriggersService {
  private readonly logger = new Logger(FlowEventTriggersService.name);

  constructor(
    private readonly executor: ResourceFlowsExecutorService,
    @InjectRepository(ResourceMaintenance) private readonly maintenances: Repository<ResourceMaintenance>,
    @InjectRepository(ResourceMaintenanceRequest) private readonly requests: Repository<ResourceMaintenanceRequest>,
  ) {}

  @OnEvent(ResourceHealthChangedEvent.EVENT_NAME)
  async onHealthChanged(event: ResourceHealthChangedEvent): Promise<void> {
    await this.run(event.resourceId, ResourceFlowNodeType.INPUT_RESOURCE_HEALTH_CHANGED, {
      event: { timestamp: new Date().toISOString() },
      health: {
        identifier: event.identifier,
        status: event.status,
        previousStatus: event.previousStatus,
        reason: event.reason,
      },
    });
  }

  /** One event covers create and finish; only a finished maintenance has `completedAt`. */
  @OnEvent(ResourceMaintenanceChangedEvent.EVENT_NAME)
  async onMaintenanceChanged(event: ResourceMaintenanceChangedEvent): Promise<void> {
    try {
      const maintenance = await this.maintenances.findOne({ where: { id: event.maintenanceId } });
      if (!maintenance) return;
      const finished = maintenance.completedAt != null;
      await this.run(
        event.resourceId,
        finished
          ? ResourceFlowNodeType.INPUT_RESOURCE_MAINTENANCE_FINISHED
          : ResourceFlowNodeType.INPUT_RESOURCE_MAINTENANCE_CREATED,
        {
          event: { timestamp: new Date().toISOString() },
          maintenance: {
            id: maintenance.id,
            reason: maintenance.reason ?? null,
            startTime: maintenance.startTime?.toISOString() ?? null,
            endTime: maintenance.endTime?.toISOString() ?? null,
          },
        },
      );
    } catch (error) {
      this.logger.error(`Failed to handle maintenance ${event.maintenanceId} for flows`, (error as Error).stack);
    }
  }

  @OnEvent(ResourceMaintenanceRequestCreatedEvent.EVENT_NAME)
  async onMaintenanceRequestCreated(event: ResourceMaintenanceRequestCreatedEvent): Promise<void> {
    try {
      const request = await this.requests.findOne({
        where: { id: event.requestId },
        relations: ['createdByUser'],
      });
      if (!request) return;
      await this.run(event.resourceId, ResourceFlowNodeType.INPUT_RESOURCE_MAINTENANCE_REQUEST_CREATED, {
        event: { timestamp: new Date().toISOString() },
        maintenanceRequest: {
          id: request.id,
          reason: request.reason,
          status: request.status,
          createdAt: request.createdAt.toISOString(),
          createdByUser: request.createdByUser
            ? { id: request.createdByUser.id, username: request.createdByUser.username }
            : null,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to handle maintenance request ${event.requestId} for flows`, (error as Error).stack);
    }
  }

  private async run(resourceId: number, type: ResourceFlowNodeType, payload: object): Promise<void> {
    try {
      await this.executor.runFlow(resourceId, type, payload);
    } catch (error) {
      this.logger.error(`Flow run for '${type}' on resource ${resourceId} failed`, (error as Error).stack);
    }
  }
}
