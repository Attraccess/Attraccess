import { SystemEvent } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ResourceHealthChangedEvent } from '../resources/health/events/resource-health-changed.event';
import { ResourceMaintenanceChangedEvent } from '../resources/maintenances/events/resource-maintenance-changed.event';
import { ResourceSessionLimitChangedEvent } from '../resources/events/resource-session-limit-changed.event';
import { PluginEventsService } from './plugin-events.service';
import {
  PLUGIN_MAINTENANCE_WINDOWS,
  type PluginMaintenanceWindowPort,
} from './persistence/plugin-maintenance-window.port';

/**
 * Forwards core domain events to plugins as typed SystemEvents. The core events are emitted after the
 * change committed, so plugins observe database state that matches the payload.
 */
@Injectable()
export class PluginSystemEventsBridge {
  private readonly logger = new Logger(PluginSystemEventsBridge.name);

  constructor(
    private readonly pluginEvents: PluginEventsService,
    @Inject(PLUGIN_MAINTENANCE_WINDOWS) private readonly maintenanceWindows: PluginMaintenanceWindowPort,
  ) {}

  @OnEvent(ResourceHealthChangedEvent.EVENT_NAME)
  public onHealthChanged(event: ResourceHealthChangedEvent): void {
    try {
      this.pluginEvents.emit(SystemEvent.RESOURCE_HEALTH_CHANGED, {
        resourceId: event.resourceId,
        status: event.status,
        previousStatus: event.previousStatus,
        reason: event.reason,
        identifier: event.identifier,
      });
    } catch (error) {
      this.logger.error(`Failed to emit ${SystemEvent.RESOURCE_HEALTH_CHANGED}`, (error as Error).stack);
    }
  }

  @OnEvent(ResourceMaintenanceChangedEvent.EVENT_NAME)
  public async onMaintenanceChanged(event: ResourceMaintenanceChangedEvent): Promise<void> {
    try {
      const maintenance = await this.maintenanceWindows.findWindow(event.maintenanceId);
      if (!maintenance) return;
      this.pluginEvents.emit(SystemEvent.MAINTENANCE_CHANGED, {
        resourceId: event.resourceId,
        maintenanceId: event.maintenanceId,
        action: event.action,
        startTime: maintenance.startTime,
        endTime: maintenance.endTime ?? null,
      });
    } catch (error) {
      this.logger.error(`Failed to emit ${SystemEvent.MAINTENANCE_CHANGED}`, (error as Error).stack);
    }
  }

  @OnEvent(ResourceSessionLimitChangedEvent.EVENT_NAME)
  public onSessionLimitChanged(event: ResourceSessionLimitChangedEvent): void {
    try {
      this.pluginEvents.emit(SystemEvent.RESOURCE_SESSION_LIMIT_CHANGED, {
        resourceId: event.resourceId,
        previousLimit: event.previousLimit,
        newLimit: event.newLimit,
        actorUserId: event.actorUserId,
      });
    } catch (error) {
      this.logger.error(`Failed to emit ${SystemEvent.RESOURCE_SESSION_LIMIT_CHANGED}`, (error as Error).stack);
    }
  }
}
