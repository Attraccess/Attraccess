import {
  BillingTransaction,
  ResourceBillingConfiguration,
  ResourceUsage,
  ResourceUsageAction,
  User,
} from '@attraccess/database-entities';
import { HandleResourceSessionStartedEventTestScope } from './billing.service.spec';
export function registerHandleResourceSessionStartedEventCreatesANegativeBillingTransactionWhenCredits0(
  scope: HandleResourceSessionStartedEventTestScope,
): void {
  it('creates a negative billing transaction when credits > 0', async () => {
    const usage = {
      id: 13,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date('2026-09-20T09:07:36.000Z'),
      endTime: new Date('2026-09-20T09:10:00.000Z'),
      usageInMinutes: 2.4,
      resource: { id: 102 },
      userId: 10,
      user: {
        id: 10,
        billingFactor: 100,
      } as User,
    } as unknown as ResourceUsage;

    // ceil(2.4) = 3 -> 3 * 10 + 5 = 35 credits
    jest
      .spyOn(scope.service, 'getResourceBillingConfiguration')
      .mockResolvedValue({ creditsPerMinute: 10, creditsPerUsage: 5 } as ResourceBillingConfiguration);

    scope.billingTransactionRepository.save.mockResolvedValue({ id: 999 } as BillingTransaction);

    const transaction = await scope.service.chargeForResourceUsage(
      usage as ResourceUsage,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Existing partial billing fixture.
      scope.createMockManager() as any,
    );

    expect(scope.service.getResourceBillingConfiguration).toHaveBeenCalledWith(102, expect.any(Object));
    // A caller-owned transaction returns the charge without publishing it before commit.
    expect(transaction).toEqual(expect.objectContaining({ id: 999, amount: -35, userId: 10, resourceUsageId: 13 }));
    expect(scope.liveNotificationsService.notifyTransactionUpdate).not.toHaveBeenCalled();
    expect(scope.emailService.sendResourceUsageBillingSummaryEmail).not.toHaveBeenCalled();
  });
}
