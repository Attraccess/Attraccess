import { ResourceUsage, User } from '@attraccess/database-entities';
import { EndSessionTestScope } from './resourceUsage.service.spec';
export function registerEndSessionRollsBackEndingTheSessionWhenBillingFails(scope: EndSessionTestScope): void {
  it('rolls back ending the session when billing fails', async () => {
    const mockActiveSession = {
      id: 1,
      resourceId: 1,
      userId: 1,
      startTime: new Date(),
      user: { id: 1 } as User,
    } as ResourceUsage;
    const mockUpdatedSession = { ...mockActiveSession, endTime: new Date(), endNotes: 'Auto-ended' };
    const billingError = new Error('Billing failed');

    scope.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession)
      .mockResolvedValueOnce(mockUpdatedSession);
    scope.billingService.chargeForResourceUsage.mockRejectedValueOnce(billingError);

    await expect(scope.service.endSession(1, mockActiveSession.user, { notes: 'Auto-ended' })).rejects.toThrow(
      billingError,
    );

    expect(scope.billingService.chargeForResourceUsage).toHaveBeenCalledWith(
      mockUpdatedSession,
      scope.transactionalEntityManager,
    );
    expect(scope.flowExecutorService.runFlow).toHaveBeenCalledTimes(1);
    expect(scope.eventEmitter.emitAsync).not.toHaveBeenCalled();
  });
}
