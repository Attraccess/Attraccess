import { Logger } from '@nestjs/common';
import { ResourceFlowNodeType, ResourceHealthStatus } from '@attraccess/database-entities';
import { ResourceHealthChangedEvent } from '../../health/events/resource-health-changed.event';
import { ResourceMaintenanceChangedEvent } from '../../maintenances/events/resource-maintenance-changed.event';
import { ResourceMaintenanceRequestCreatedEvent } from '../../maintenances/events/maintenance-request-created.event';
import { FlowEventTriggersService } from './flow-event-triggers.service';

describe('FlowEventTriggersService', () => {
  const executor = { runFlow: jest.fn() };
  const maintenances = { findOne: jest.fn() };
  const requests = { findOne: jest.fn() };
  const service = new FlowEventTriggersService(executor as never, maintenances as never, requests as never);

  beforeEach(() => {
    jest.resetAllMocks();
    executor.runFlow.mockResolvedValue([]);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('runs the health changed trigger with the status change', async () => {
    await service.onHealthChanged(
      new ResourceHealthChangedEvent(4, 'bridge', ResourceHealthStatus.UNHEALTHY, 'lost', ResourceHealthStatus.HEALTHY),
    );

    expect(executor.runFlow).toHaveBeenCalledWith(
      4,
      ResourceFlowNodeType.INPUT_RESOURCE_HEALTH_CHANGED,
      expect.objectContaining({
        health: { identifier: 'bridge', status: 'unhealthy', previousStatus: 'healthy', reason: 'lost' },
      }),
    );
  });

  it('distinguishes created from finished maintenances by completion', async () => {
    const base = {
      id: 8,
      reason: 'Belt',
      startTime: new Date('2026-01-01T10:00:00Z'),
      endTime: null,
      completedAt: null,
    };
    maintenances.findOne.mockResolvedValueOnce(base);
    await service.onMaintenanceChanged(new ResourceMaintenanceChangedEvent(4, 8));
    expect(executor.runFlow).toHaveBeenLastCalledWith(
      4,
      ResourceFlowNodeType.INPUT_RESOURCE_MAINTENANCE_CREATED,
      expect.objectContaining({
        maintenance: { id: 8, reason: 'Belt', startTime: '2026-01-01T10:00:00.000Z', endTime: null },
      }),
    );

    const end = new Date('2026-01-01T11:00:00Z');
    maintenances.findOne.mockResolvedValueOnce({ ...base, endTime: end, completedAt: end });
    await service.onMaintenanceChanged(new ResourceMaintenanceChangedEvent(4, 8));
    expect(executor.runFlow).toHaveBeenLastCalledWith(
      4,
      ResourceFlowNodeType.INPUT_RESOURCE_MAINTENANCE_FINISHED,
      expect.objectContaining({ maintenance: expect.objectContaining({ endTime: '2026-01-01T11:00:00.000Z' }) }),
    );
  });

  it('runs the maintenance request trigger with the user-visible fields', async () => {
    requests.findOne.mockResolvedValue({
      id: 3,
      reason: 'Noisy',
      status: 'open',
      createdAt: new Date('2026-01-02T00:00:00Z'),
      createdByUser: { id: 2, username: 'ann', email: 'secret@example.com' },
    });

    await service.onMaintenanceRequestCreated(new ResourceMaintenanceRequestCreatedEvent(4, 3));

    expect(executor.runFlow).toHaveBeenCalledWith(
      4,
      ResourceFlowNodeType.INPUT_RESOURCE_MAINTENANCE_REQUEST_CREATED,
      expect.objectContaining({
        maintenanceRequest: {
          id: 3,
          reason: 'Noisy',
          status: 'open',
          createdAt: '2026-01-02T00:00:00.000Z',
          createdByUser: { id: 2, username: 'ann' },
        },
      }),
    );
  });

  it('logs a failing flow run instead of rejecting the event', async () => {
    executor.runFlow.mockRejectedValue(new Error('boom'));
    await expect(
      service.onHealthChanged(new ResourceHealthChangedEvent(4, '', ResourceHealthStatus.HEALTHY, null, null)),
    ).resolves.toBeUndefined();
  });
});
