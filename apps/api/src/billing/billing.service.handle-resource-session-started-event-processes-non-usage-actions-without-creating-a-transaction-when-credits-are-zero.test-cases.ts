import { ResourceBillingConfiguration, ResourceUsage, ResourceUsageAction } from '@attraccess/database-entities';
import { HandleResourceSessionStartedEventTestScope } from './billing.service.spec';
export function registerHandleResourceSessionStartedEventProcessesNonUsageActionsWithoutCreatingATransactionWhenCreditsAreZero(
  scope: HandleResourceSessionStartedEventTestScope,
): void {
  it('processes non-Usage actions without creating a transaction when credits are zero', async () => {
    const usage = {
      id: 10,
      usageAction: ResourceUsageAction.DoorLock,
      startTime: new Date('2026-09-20T09:07:00.000Z'),
      endTime: new Date('2026-09-20T09:10:00.000Z'),
      usageInMinutes: 3,
      resource: { id: 99 },
      userId: 7,
    } as unknown as ResourceUsage;

    jest
      .spyOn(scope.service, 'getResourceBillingConfiguration')
      .mockResolvedValue({ creditsPerMinute: 0, creditsPerUsage: 0 } as ResourceBillingConfiguration);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await scope.service.chargeForResourceUsage(usage as ResourceUsage, scope.createMockManager() as any);

    expect(scope.service.getResourceBillingConfiguration).toHaveBeenCalledWith(99, expect.any(Object));
    expect(scope.billingTransactionRepository.save).not.toHaveBeenCalled();
  });
}
