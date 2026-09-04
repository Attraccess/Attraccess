import { ResourceOperatingAttributionController } from './resource-operating-attribution.controller';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import {
  ResourceOperatingAttributionService,
  ResourceOperatingAttributionSummary,
} from './resource-operating-attribution.service';

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

    await expect(controller.getForResource(12, { user: {} } as AuthenticatedRequest)).resolves.toBe(summary);
    expect(attributionService.getForResource).toHaveBeenCalledWith(12);
  });
});
