import { BillingTransaction } from '@attraccess/database-entities';
import { registerBillingControllerFixture } from './billing.controller.billing-controller.test-fixture';
import { UpdateResourceBillingConfigurationDto } from './dto/update-resource-billing-configuration.dto';

export function registerTopUpWithSumUpReaderCases(fixture: ReturnType<typeof registerBillingControllerFixture>) {
  describe('topUpWithSumUpReader', () => {
    it('uses request.user.id and delegates to sumUpService', async () => {
      const tx = { id: 999 } as BillingTransaction;
      fixture.sumUp.topUpWithReader.mockResolvedValue(tx);
      const req = fixture.baseReq({ id: 55 });
      const res = await fixture.controller.topUpWithSumUpReader({ readerId: 'r-22', amount: 2500 }, req);
      expect(fixture.sumUp.topUpWithReader).toHaveBeenCalledWith(55, 'r-22', 2500);
      expect(res).toBe(tx);
    });
  });
}

export function registerUpdateResourceBillingConfigurationCases(
  fixture: ReturnType<typeof registerBillingControllerFixture>,
) {
  describe('updateResourceBillingConfiguration', () => {
    it('delegates to service and returns updated configuration', async () => {
      const body = { pricing: { perHour: 12 } } as UpdateResourceBillingConfigurationDto;
      const updated = { pricing: { perHour: 12 } };
      fixture.service.updateResourceBillingConfiguration.mockResolvedValue(updated);
      const res = await fixture.controller.updateResourceBillingConfiguration(7, body);
      expect(fixture.service.updateResourceBillingConfiguration).toHaveBeenCalledWith(7, body);
      expect(res).toBe(updated);
    });
  });
}
