import { ResourceBillingConfiguration } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { ResourceBillingConfigurationNotFoundException } from './errors/resource-billing-configuration-not-found.error';
import { registerBillingServiceFixture } from './billing.service.billing-service.test-fixture';
export function registerUpdateResourceBillingConfigurationCases(
  fixture: ReturnType<typeof registerBillingServiceFixture>,
) {
  describe('updateResourceBillingConfiguration', () => {
    it('throws when configuration not found', async () => {
      fixture.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(null);
      await expect(
        fixture.service.updateResourceBillingConfiguration(1, { creditsPerUsage: 1, creditsPerMinute: 1 }),
      ).rejects.toBeInstanceOf(ResourceBillingConfigurationNotFoundException);
    });

    it('throws when creditsPerMinute is negative', async () => {
      const cfg = { resourceId: 1, creditsPerUsage: 0, creditsPerMinute: 0 } as ResourceBillingConfiguration;

      fixture.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(cfg);
      await expect(
        fixture.service.updateResourceBillingConfiguration(1, { creditsPerMinute: -1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when creditsPerUsage is negative', async () => {
      const cfg = { resourceId: 1, creditsPerUsage: 0, creditsPerMinute: 0 } as ResourceBillingConfiguration;

      fixture.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(cfg);
      await expect(
        fixture.service.updateResourceBillingConfiguration(1, { creditsPerUsage: -1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('coerces nulls to 0 and saves', async () => {
      const cfg = { resourceId: 1, creditsPerUsage: 5, creditsPerMinute: 6 } as ResourceBillingConfiguration;

      fixture.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(cfg);
      fixture.resourceBillingConfigurationRepository.save.mockImplementation(
        async (arg) => arg as ResourceBillingConfiguration,
      );

      const result = await fixture.service.updateResourceBillingConfiguration(1, {
        creditsPerUsage: null,
        creditsPerMinute: null,
      });

      expect(fixture.resourceBillingConfigurationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ creditsPerUsage: 0, creditsPerMinute: 0 }),
      );
      expect(result.creditsPerUsage).toBe(0);
      expect(result.creditsPerMinute).toBe(0);
    });

    it('throws on fractional values', async () => {
      const cfg = { resourceId: 1, creditsPerUsage: 0, creditsPerMinute: 0 } as ResourceBillingConfiguration;
      fixture.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(cfg);

      await expect(
        fixture.service.updateResourceBillingConfiguration(1, { creditsPerUsage: 1.5 }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        fixture.service.updateResourceBillingConfiguration(1, { creditsPerMinute: 2.2 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('stores the energy rate, coerces null to 0, and rejects negative or fractional rates', async () => {
      const cfg = {
        resourceId: 1,
        creditsPerUsage: 0,
        creditsPerMinute: 0,
        creditsPerKwh: 0,
      } as ResourceBillingConfiguration;
      fixture.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(cfg);
      fixture.resourceBillingConfigurationRepository.save.mockImplementation(
        async (arg) => arg as ResourceBillingConfiguration,
      );

      expect((await fixture.service.updateResourceBillingConfiguration(1, { creditsPerKwh: 30 })).creditsPerKwh).toBe(
        30,
      );
      expect((await fixture.service.updateResourceBillingConfiguration(1, { creditsPerKwh: null })).creditsPerKwh).toBe(
        0,
      );
      await expect(fixture.service.updateResourceBillingConfiguration(1, { creditsPerKwh: -1 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        fixture.service.updateResourceBillingConfiguration(1, { creditsPerKwh: 0.3 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('treats an energy rate alone as billing being enabled', async () => {
      jest.spyOn(fixture.service, 'getResourceBillingConfiguration').mockResolvedValue({
        creditsPerUsage: 0,
        creditsPerMinute: 0,
        creditsPerOperatingMinute: 0,
        creditsPerKwh: 30,
      } as ResourceBillingConfiguration);
      await expect(fixture.service.isBillingEnabled(1)).resolves.toBe(true);
    });

    it('allows partial update without validating undefined fields', async () => {
      const cfg = { resourceId: 1, creditsPerUsage: 1, creditsPerMinute: 2 } as ResourceBillingConfiguration;

      fixture.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(cfg);
      fixture.resourceBillingConfigurationRepository.save.mockImplementation(
        async (arg) => arg as ResourceBillingConfiguration,
      );

      const result = await fixture.service.updateResourceBillingConfiguration(1, { creditsPerUsage: 3 });
      expect(result.creditsPerUsage).toBe(3);
      expect(result.creditsPerMinute).toBe(2);
    });
  });
}
