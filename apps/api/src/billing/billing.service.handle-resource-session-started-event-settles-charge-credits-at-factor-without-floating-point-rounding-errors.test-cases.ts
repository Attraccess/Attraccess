import { ResourceBillingConfiguration, ResourceUsage, BillingTransactionItem } from '@attraccess/database-entities';
import { HandleResourceSessionStartedEventTestScope } from './billing.service.spec';
export function registerHandleResourceSessionStartedEventSettlesChargeCreditsAtFactorWithoutFloatingPointRoundingErrors(
  scope: HandleResourceSessionStartedEventTestScope,
): void {
  it.each([
    { charge: 45, factor: 50, amount: 22 },
    { charge: Number.MAX_SAFE_INTEGER - 2, factor: 67, amount: 6034823500676463 },
    { charge: 100, factor: 12.5, amount: 12 },
  ])(
    'settles $charge credits at $factor% without floating-point rounding errors',
    async ({ charge, factor, amount }) => {
      const usage = {
        id: 22,
        startTime: new Date('2026-09-20T09:00:00Z'),
        endTime: new Date('2026-09-20T09:00:00Z'),
        creditsPerUsage: charge,
        sessionDurationCreditsPerMinute: 0,
        operatingDurationCreditsPerMinute: 0,
        billingFactor: factor,
        resource: { id: 205 },
        userId: 25,
        user: { id: 25, billingFactor: 100 },
      } as ResourceUsage;
      jest
        .spyOn(scope.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({} as ResourceBillingConfiguration);
      const manager = scope.createMockManager();
      const transaction = await scope.service.chargeForResourceUsage(usage, manager as never);
      expect(transaction.amount).toBe(-amount);
      expect(manager.save).toHaveBeenCalledWith(
        BillingTransactionItem,
        expect.objectContaining({ name: 'BILLING_FACTOR', unitPrice: -(charge - amount) }),
      );
    },
  );
}
