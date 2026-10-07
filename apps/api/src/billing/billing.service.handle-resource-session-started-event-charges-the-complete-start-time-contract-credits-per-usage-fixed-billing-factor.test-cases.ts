import { ResourceBillingConfiguration, ResourceUsage, BillingTransactionItem } from '@attraccess/database-entities';
import { HandleResourceSessionStartedEventTestScope } from './billing.service.spec';
export function registerHandleResourceSessionStartedEventChargesTheCompleteStartTimeContractCreditsPerUsageFixedBillingFactor(
  scope: HandleResourceSessionStartedEventTestScope,
): void {
  it.each([
    { creditsPerUsage: 6, billingFactor: 50, expectedCharge: 15 },
    { creditsPerUsage: 0, billingFactor: 100, expectedCharge: 24 },
    { creditsPerUsage: 6, billingFactor: 0, expectedCharge: 0 },
  ])('charges the complete start-time contract ($creditsPerUsage fixed, $billingFactor%)', async (contract) => {
    const usage = {
      id: 22,
      startTime: new Date('2026-09-20T09:00:00Z'),
      endTime: new Date('2026-09-20T09:02:00Z'),
      usageInMinutes: 2,
      attributedOperatingDurationInMinutes: 1,
      sessionDurationCreditsPerMinute: 10,
      operatingDurationCreditsPerMinute: 4,
      creditsPerUsage: contract.creditsPerUsage,
      billingFactor: contract.billingFactor,
      resource: { id: 205 },
      userId: 25,
      user: { id: 25, billingFactor: 200 },
    } as ResourceUsage;
    jest.spyOn(scope.service, 'getResourceBillingConfiguration').mockResolvedValue({
      creditsPerUsage: 99,
      creditsPerMinute: 99,
      creditsPerOperatingMinute: 99,
    } as ResourceBillingConfiguration);
    const manager = scope.createMockManager();

    const transaction = await scope.service.chargeForResourceUsage(usage, manager as never);

    expect(transaction.amount).toBe(-contract.expectedCharge);
    expect(manager.save).toHaveBeenCalledWith(
      BillingTransactionItem,
      expect.objectContaining({ name: 'PER_SESSION', unitPrice: contract.creditsPerUsage, quantity: 1 }),
    );
    if (contract.billingFactor !== 100) {
      expect(manager.save).toHaveBeenCalledWith(
        BillingTransactionItem,
        expect.objectContaining({ name: 'BILLING_FACTOR', description: `${contract.billingFactor}%` }),
      );
    }
  });
}
