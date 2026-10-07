import {
  ResourceBillingConfiguration,
  ResourceUsage,
  BillingTransactionItem,
  BillingTransactionStatus,
} from '@attraccess/database-entities';
import { HandleResourceSessionStartedEventTestScope } from './billing.service.spec';
export function registerHandleResourceSessionStartedEventBillsAndRecordsExactDurationDurationMsMsIndependentlyForBothComponents(
  scope: HandleResourceSessionStartedEventTestScope,
): void {
  it.each([
    { durationMs: 0, roundedMinutes: 0 },
    { durationMs: 60_000, roundedMinutes: 1 },
    { durationMs: 60_001, roundedMinutes: 2 },
  ])(
    'bills and records exact duration $durationMs ms independently for both components',
    async ({ durationMs, roundedMinutes }) => {
      const startTime = new Date('2026-09-20T09:05:00Z');
      const usage = {
        id: 22,
        startTime,
        endTime: new Date(startTime.getTime() + durationMs),
        // SQLite's generated Julian-day duration can be just above an exact minute.
        usageInMinutes: durationMs === 60_000 ? 1.000000610947609 : durationMs / 60_000,
        attributedOperatingDurationInMinutes: durationMs / 60_000,
        sessionDurationCreditsPerMinute: 3,
        operatingDurationCreditsPerMinute: 7,
        creditsPerUsage: 0,
        billingFactor: 100,
        resource: { id: 205 },
        userId: 25,
      } as ResourceUsage;
      jest
        .spyOn(scope.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerUsage: 0, creditsPerMinute: 0 } as ResourceBillingConfiguration);
      const manager = scope.createMockManager();
      manager.findOne.mockResolvedValue({ id: 999, items: [], status: BillingTransactionStatus.Pending });

      const transaction = await scope.service.chargeForResourceUsage(usage, manager as never);

      expect(transaction.amount).toBe(-roundedMinutes * 10);
      expect(manager.save).toHaveBeenCalledWith(
        BillingTransactionItem,
        expect.objectContaining({
          name: 'PER_MINUTE',
          durationMs,
          quantity: roundedMinutes,
          unitPrice: 3,
        }),
      );
      expect(manager.save).toHaveBeenCalledWith(
        BillingTransactionItem,
        expect.objectContaining({
          name: 'PER_ATTRIBUTABLE_OPERATING_MINUTE',
          durationMs,
          quantity: roundedMinutes,
          unitPrice: 7,
        }),
      );
    },
  );
}
