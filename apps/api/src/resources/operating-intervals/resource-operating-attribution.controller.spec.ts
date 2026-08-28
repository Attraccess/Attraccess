import { ResourceOperatingAttributionController } from './resource-operating-attribution.controller';
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
    const controller = new ResourceOperatingAttributionController(attributionService);

    await expect(controller.getForResource(12)).resolves.toBe(summary);
    expect(attributionService.getForResource).toHaveBeenCalledWith(12);
  });
});
