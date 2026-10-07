import { Resource, ResourceUsage, User } from '@attraccess/database-entities';
import { EndUsageSessionDto } from './dtos/endUsageSession.dto';
import { EndSessionTestScope } from './resourceUsage.service.spec';
export function registerEndSessionLooksUpTheActiveSessionInsideTheStopTransaction(scope: EndSessionTestScope): void {
  it('looks up the active session inside the stop transaction', async () => {
    const dto: EndUsageSessionDto = { notes: 'Session completed' };
    const sessionOwner = { id: 1, username: 'owner' } as User;
    const mockActiveSession = {
      id: 5,
      resourceId: 12,
      userId: sessionOwner.id,
      startTime: new Date(),
      user: sessionOwner,
      resource: { id: 12, name: 'Laser cutter' } as Resource,
    } as ResourceUsage;
    const mockUpdatedSession = { ...mockActiveSession, endTime: new Date(), endNotes: 'Session completed' };
    let transactionStarted = false;

    (scope.resourceUsageRepository.manager.transaction as jest.Mock).mockImplementationOnce(async (cb) => {
      transactionStarted = true;
      return cb(scope.transactionalEntityManager);
    });
    scope.resourceUsageRepository.findOne.mockImplementation(async () => {
      expect(transactionStarted).toBe(true);
      return scope.resourceUsageRepository.findOne.mock.calls.length === 1 ? mockActiveSession : mockUpdatedSession;
    });

    await scope.service.endSession(mockActiveSession.resourceId, sessionOwner, dto);

    expect(scope.flowExecutorService.runFlow).toHaveBeenCalledTimes(1);
    expect(scope.billingService.chargeForResourceUsage).toHaveBeenCalledTimes(1);
  });
}
