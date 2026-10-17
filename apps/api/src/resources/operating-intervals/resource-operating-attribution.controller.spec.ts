import { ResourceOperatingAttributionController } from './resource-operating-attribution.controller';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import {
  ResourceOperatingAttributionService,
  ResourceOperatingAttributionSummary,
} from './resource-operating-attribution.service';
import { ResourceMaintenanceService } from '../maintenances/maintenance.service';
import {
  ResourceOperatingInterval,
  ResourceUsage,
  ResourceUsageAction,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import { IsNull, LessThan, MoreThan, Repository } from 'typeorm';

describe('ResourceOperatingAttributionController', () => {
  it('returns the current attribution for the requested resource', async () => {
    const summary = { attributions: [] } as unknown as ResourceOperatingAttributionSummary;
    const attributionService = {
      getForResource: jest.fn().mockResolvedValue(summary),
    } as unknown as ResourceOperatingAttributionService;
    const maintenanceService = {
      canManageMaintenance: jest.fn().mockResolvedValue(true),
    } as unknown as ResourceMaintenanceService;
    const controller = new ResourceOperatingAttributionController(attributionService, maintenanceService);

    await expect(controller.getForResource(12, { user: {} } as AuthenticatedRequest, {})).resolves.toBe(summary);
    expect(attributionService.getForResource).toHaveBeenCalledWith(12);
  });

  it('bounds range-free ongoing-session attribution to the preceding 31 days', async () => {
    const asOf = new Date('2026-10-05T12:00:00.000Z');
    const windowStart = new Date('2026-09-04T12:00:00.000Z');
    const startTime = new Date('2026-08-01T12:00:00.000Z');
    const intervalRepository = {
      find: jest.fn().mockResolvedValue([{ id: 1, resourceId: 12, startTime, endTime: null }]),
      existsBy: jest.fn().mockResolvedValue(true),
    };
    const usageRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 2,
          resourceId: 12,
          usageAction: ResourceUsageAction.Usage,
          isFinalized: true,
          lifecyclePending: false,
          startTime,
          endTime: null,
        },
      ]),
    };
    const lifecycleAttemptRepository = { find: jest.fn().mockResolvedValue([]) };
    const service = new ResourceOperatingAttributionService(
      intervalRepository as unknown as Repository<ResourceOperatingInterval>,
      usageRepository as unknown as Repository<ResourceUsage>,
      lifecycleAttemptRepository as unknown as Repository<ResourceUsageLifecycleAttempt>,
    );
    const maintenanceService = {
      canManageMaintenance: jest.fn().mockResolvedValue(true),
    } as unknown as ResourceMaintenanceService;
    const controller = new ResourceOperatingAttributionController(service, maintenanceService);

    jest.useFakeTimers().setSystemTime(asOf);
    try {
      const result = await controller.getForResource(12, { user: {} } as AuthenticatedRequest, {});

      expect(intervalRepository.find).toHaveBeenCalledWith({
        where: [
          { resourceId: 12, startTime: LessThan(asOf), endTime: IsNull() },
          { resourceId: 12, startTime: LessThan(asOf), endTime: MoreThan(windowStart) },
        ],
        order: { startTime: 'ASC' },
      });
      expect(usageRepository.find).toHaveBeenCalledWith({
        where: [IsNull(), MoreThan(windowStart)].map((endTime) => ({
          resourceId: 12,
          usageAction: ResourceUsageAction.Usage,
          lifecyclePending: false,
          startTime: LessThan(asOf),
          endTime,
        })),
        order: { startTime: 'ASC' },
      });
      const durationMs = asOf.getTime() - windowStart.getTime();
      expect(result).toMatchObject({
        asOf,
        windowStart,
        sessionDurationMs: durationMs,
        operatingDurationMs: durationMs,
        attributedOperatingDurationMs: durationMs,
        isProvisional: true,
        attributions: [expect.objectContaining({ usageId: 2, startTime: windowStart, endTime: asOf, durationMs })],
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses the requested attribution range', async () => {
    const attributionService = {
      getForResource: jest.fn().mockResolvedValue({ attributions: [] }),
    } as unknown as ResourceOperatingAttributionService;
    const maintenanceService = {
      canManageMaintenance: jest.fn().mockResolvedValue(true),
    } as unknown as ResourceMaintenanceService;
    const controller = new ResourceOperatingAttributionController(attributionService, maintenanceService);
    const start = '2026-07-01T10:00:00.000Z';
    const end = '2026-07-01T11:00:00.000Z';

    await controller.getForResource(12, { user: {} } as AuthenticatedRequest, { start, end });

    expect(attributionService.getForResource).toHaveBeenCalledWith(12, new Date(end), new Date(start));
  });
});
