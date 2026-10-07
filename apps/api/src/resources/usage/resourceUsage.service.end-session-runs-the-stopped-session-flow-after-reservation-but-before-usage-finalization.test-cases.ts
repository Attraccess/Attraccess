import { ResourceUsage, User, ResourceFlowNodeType } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { EndSessionTestScope } from './resourceUsage.service.spec';
export function registerEndSessionRunsTheStoppedSessionFlowAfterReservationButBeforeUsageFinalization(
  scope: EndSessionTestScope,
): void {
  it('runs the stopped-session flow after reservation but before usage finalization', async () => {
    const mockActiveSession = {
      id: 1,
      resourceId: 1,
      userId: 1,
      startTime: new Date(),
      user: { id: 1 } as User,
    } as ResourceUsage;
    const mockUpdatedSession = { ...mockActiveSession, endTime: new Date(), endNotes: 'Auto-ended' };
    const calls: string[] = [];
    let usageTransactionCommitted = false;

    scope.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession)
      .mockResolvedValueOnce(mockUpdatedSession)
      .mockResolvedValueOnce(mockUpdatedSession);

    const mockUpdateQueryBuilder = scope.createMockQueryBuilder(null);
    (scope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );
    scope.transactionalEntityManager.update.mockImplementation(async (entity, _id, values) => {
      if (entity === ResourceUsage && values.endTime) calls.push('update');
      return { affected: 1 };
    });
    scope.flowExecutorService.runFlow.mockImplementation(async () => {
      expect(usageTransactionCommitted).toBe(true);
      calls.push('flow');
      return [];
    });
    (scope.resourceUsageRepository.manager.transaction as jest.Mock).mockImplementationOnce(async (callback) => {
      const result = await callback(scope.transactionalEntityManager);
      usageTransactionCommitted = true;
      return result;
    });

    await scope.service.endSession(1, mockActiveSession.user, { notes: 'Auto-ended' });

    expect(calls).toEqual(['flow', 'update']);
    expect(scope.flowExecutorService.runFlow).toHaveBeenCalledWith(
      1,
      ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
      expect.objectContaining({ endNotes: 'Auto-ended' }),
      undefined,
      { lifecycleAttemptId: expect.any(String) },
    );
  });
}
