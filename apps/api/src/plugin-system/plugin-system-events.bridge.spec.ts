import { ResourceHealthStatus, ResourceMaintenance } from '@attraccess/database-entities';
import { SystemEvent } from '@attraccess/plugins-backend-sdk';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { ResourceSessionLimitChangedEvent } from '../resources/events/resource-session-limit-changed.event';
import { ResourceHealthChangedEvent } from '../resources/health/events/resource-health-changed.event';
import { ResourceMaintenanceChangedEvent } from '../resources/maintenances/events/resource-maintenance-changed.event';
import { PluginEventsService } from './plugin-events.service';
import { PluginSystemEventsBridge } from './plugin-system-events.bridge';

describe('PluginSystemEventsBridge', () => {
  let pluginEvents: PluginEventsService;
  let findOne: jest.Mock;
  let bridge: PluginSystemEventsBridge;

  beforeEach(() => {
    pluginEvents = new PluginEventsService(new EventEmitter2());
    findOne = jest.fn();
    bridge = new PluginSystemEventsBridge(pluginEvents, {
      getRepository: () => ({ findOne }),
    } as unknown as DataSource);
  });

  it('forwards health status changes to plugins', () => {
    const handler = jest.fn();
    pluginEvents.onEvent(SystemEvent.RESOURCE_HEALTH_CHANGED, handler);

    bridge.onHealthChanged(
      new ResourceHealthChangedEvent(
        4,
        'mqtt',
        ResourceHealthStatus.UNHEALTHY,
        'offline',
        ResourceHealthStatus.HEALTHY,
      ),
    );

    expect(handler).toHaveBeenCalledWith({
      resourceId: 4,
      status: ResourceHealthStatus.UNHEALTHY,
      previousStatus: ResourceHealthStatus.HEALTHY,
      reason: 'offline',
      identifier: 'mqtt',
    });
  });

  it('forwards a changed session limit to plugins', () => {
    const handler = jest.fn();
    pluginEvents.onEvent(SystemEvent.RESOURCE_SESSION_LIMIT_CHANGED, handler);

    bridge.onSessionLimitChanged(new ResourceSessionLimitChangedEvent(4, 3, 2, 7));

    expect(handler).toHaveBeenCalledWith({ resourceId: 4, previousLimit: 3, newLimit: 2, actorUserId: 7 });
  });

  it.each(['created', 'finished'] as const)('forwards %s maintenance with its persisted window', async (action) => {
    const startTime = new Date('2030-01-01T10:00:00Z');
    const endTime = action === 'finished' ? new Date('2030-01-01T12:00:00Z') : null;
    findOne.mockResolvedValue({ id: 9, resourceId: 4, startTime, endTime } as ResourceMaintenance);
    const handler = jest.fn();
    pluginEvents.onEvent(SystemEvent.MAINTENANCE_CHANGED, handler);

    await bridge.onMaintenanceChanged(new ResourceMaintenanceChangedEvent(4, 9, action));

    expect(findOne).toHaveBeenCalledWith({ where: { id: 9 } });
    expect(handler).toHaveBeenCalledWith({ resourceId: 4, maintenanceId: 9, action, startTime, endTime });
  });

  it('skips maintenance that no longer exists and contains lookup failures', async () => {
    const handler = jest.fn();
    pluginEvents.onEvent(SystemEvent.MAINTENANCE_CHANGED, handler);
    findOne.mockResolvedValueOnce(null);
    await bridge.onMaintenanceChanged(new ResourceMaintenanceChangedEvent(4, 9, 'created'));
    findOne.mockRejectedValueOnce(new Error('db down'));
    jest.spyOn((bridge as unknown as { logger: { error: () => void } }).logger, 'error').mockImplementation();
    await expect(
      bridge.onMaintenanceChanged(new ResourceMaintenanceChangedEvent(4, 9, 'created')),
    ).resolves.toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
  });
});
