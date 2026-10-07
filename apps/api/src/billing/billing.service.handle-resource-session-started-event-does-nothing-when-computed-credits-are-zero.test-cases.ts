import { ResourceBillingConfiguration, ResourceUsage, ResourceUsageAction } from '@attraccess/database-entities';
import { HandleResourceSessionStartedEventTestScope } from './billing.service.spec';
export function registerHandleResourceSessionStartedEventDoesNothingWhenComputedCreditsAreZero(
  scope: HandleResourceSessionStartedEventTestScope,
): void {
  it('does nothing when computed credits are zero', async () => {
    const usage = {
      id: 12,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date('2026-09-20T09:05:00.000Z'),
      endTime: new Date('2026-09-20T09:10:00.000Z'),
      usageInMinutes: 5,
      resource: { id: 101 },
      userId: 9,
    } as unknown as ResourceUsage;

    jest
      .spyOn(scope.service, 'getResourceBillingConfiguration')
      .mockResolvedValue({ creditsPerMinute: 0, creditsPerUsage: 0 } as ResourceBillingConfiguration);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await scope.service.chargeForResourceUsage(usage as ResourceUsage, scope.createMockManager() as any);

    expect(scope.service.getResourceBillingConfiguration).toHaveBeenCalledWith(101, expect.any(Object));
    expect(scope.billingTransactionRepository.save).not.toHaveBeenCalled();
  });
}
