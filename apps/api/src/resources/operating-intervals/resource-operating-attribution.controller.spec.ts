import { ResourceOperatingAttributionController } from './resource-operating-attribution.controller';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import {
  ResourceOperatingAttributionService,
  ResourceOperatingAttributionSummary,
} from './resource-operating-attribution.service';
import { ResourceMaintenanceService } from '../maintenances/maintenance.service';

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
