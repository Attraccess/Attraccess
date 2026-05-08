import { Test, TestingModule } from '@nestjs/testing';
import { ResourceHealthController } from './resource-health.controller';
import { ResourceHealthService } from './resource-health.service';
import { ResourceHealthSource, ResourceHealthStatus } from '@attraccess/database-entities';
import { CanManageMaintenanceGuard } from '../maintenances/canManageMaintenance.guard';

describe('ResourceHealthController', () => {
  let controller: ResourceHealthController;
  let service: jest.Mocked<ResourceHealthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ResourceHealthController],
      providers: [
        {
          provide: ResourceHealthService,
          useValue: {
            getSummary: jest.fn(),
            clearEntry: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(CanManageMaintenanceGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ResourceHealthController);
    service = module.get(ResourceHealthService);
  });

  it('delegates clearResourceHealthEntry to the service', async () => {
    service.clearEntry.mockResolvedValue(undefined);
    await controller.clearResourceHealthEntry(7, 42);
    expect(service.clearEntry).toHaveBeenCalledWith(7, 42);
  });

  it('returns the summary from the service', async () => {
    const expected = {
      resourceId: 7,
      isHealthy: false,
      entries: [
        {
          id: 1,
          resourceId: 7,
          identifier: 'Shelly',
          status: ResourceHealthStatus.UNHEALTHY,
          reason: 'no connection',
          source: ResourceHealthSource.HEARTBEAT,
          lastReportedAt: new Date('2026-04-25T00:00:00Z').toISOString(),
        },
      ],
      unhealthyEntries: [
        {
          id: 1,
          resourceId: 7,
          identifier: 'Shelly',
          status: ResourceHealthStatus.UNHEALTHY,
          reason: 'no connection',
          source: ResourceHealthSource.HEARTBEAT,
          lastReportedAt: new Date('2026-04-25T00:00:00Z').toISOString(),
        },
      ],
    };
    service.getSummary.mockResolvedValue(expected);

    const result = await controller.getResourceHealth(7);
    expect(service.getSummary).toHaveBeenCalledWith(7);
    expect(result).toBe(expected);
  });
});
