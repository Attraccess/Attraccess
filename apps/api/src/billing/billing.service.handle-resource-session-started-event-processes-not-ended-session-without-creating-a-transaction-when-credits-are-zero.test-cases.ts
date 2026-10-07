import { ResourceBillingConfiguration, ResourceUsage, ResourceUsageAction } from '@attraccess/database-entities';
import { HandleResourceSessionStartedEventTestScope } from './billing.service.spec';
export function registerHandleResourceSessionStartedEventProcessesNotEndedSessionWithoutCreatingATransactionWhenCreditsAreZero(
  scope: HandleResourceSessionStartedEventTestScope,
): void {
  it('processes not-ended session without creating a transaction when credits are zero', async () => {
    const usage = {
      id: 11,
      usageAction: ResourceUsageAction.Usage,
      endTime: null,
      usageInMinutes: -1,
      resource: { id: 100 },
      userId: 8,
    } as unknown as ResourceUsage;

    jest
      .spyOn(scope.service, 'getResourceBillingConfiguration')
      .mockResolvedValue({ creditsPerMinute: 0, creditsPerUsage: 0 } as ResourceBillingConfiguration);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await scope.service.chargeForResourceUsage(usage as ResourceUsage, scope.createMockManager() as any);

    expect(scope.service.getResourceBillingConfiguration).toHaveBeenCalledWith(100, expect.any(Object));
    expect(scope.billingTransactionRepository.save).not.toHaveBeenCalled();
  });
}
