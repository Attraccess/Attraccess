import { ResourceUsage, User, ResourceFlowNodeType } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { ResourceUsageSessionEndedEvent } from './events/resource-usage.events';
import { ExternalEffectFailureError } from '../flows/errors/external-effect-failure.error';
import { FlowExecutionError } from '../flows/errors/flow-execution.error';
import { EndSessionTestScope } from './resourceUsage.service.spec';
export function registerEndSessionLeavesTheSessionActiveWhenFailureIsPropagated(scope: EndSessionTestScope): void {
  it.each([
    {
      failure: 'an acknowledgement timeout',
      error: new ExternalEffectFailureError(
        'MQTT acknowledgement timed out',
        new Error('MQTT acknowledgement timed out'),
        'acknowledgement-timeout',
      ),
    },
    {
      failure: 'an error node failure',
      error: new FlowExecutionError('Bitte die Tür schließen'),
    },
  ])('leaves the session active when $failure is propagated', async ({ error }) => {
    const mockActiveSession = {
      id: 1,
      resourceId: 1,
      userId: 1,
      startTime: new Date(),
      user: { id: 1 } as User,
    } as ResourceUsage;
    const mockUpdatedSession = { ...mockActiveSession, endTime: new Date(), endNotes: 'Auto-ended' };
    let usageTransactionCommitted = false;

    scope.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession)
      .mockResolvedValueOnce(mockUpdatedSession);
    scope.flowExecutorService.runFlow.mockRejectedValueOnce(error);
    const mockUpdateQueryBuilder = scope.createMockQueryBuilder(null);
    let sessionEnded = false;
    (scope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );
    (mockUpdateQueryBuilder.execute as jest.Mock).mockImplementation(async () => {
      sessionEnded = true;
    });
    (scope.resourceUsageRepository.manager.transaction as jest.Mock).mockImplementationOnce(async (callback) => {
      const result = await callback(scope.transactionalEntityManager);
      usageTransactionCommitted = true;
      return result;
    });

    await expect(scope.service.endSession(1, mockActiveSession.user, { notes: 'Auto-ended' })).rejects.toBe(error);

    expect(scope.eventEmitter.emitAsync).not.toHaveBeenCalled();
    expect(scope.eventEmitter.emit).not.toHaveBeenCalledWith(
      ResourceUsageSessionEndedEvent.EVENT_NAME,
      expect.any(Object),
    );
    expect(scope.mockMetricsService.resourceUsageSessionsTotal.inc).not.toHaveBeenCalled();
    expect(usageTransactionCommitted).toBe(true);
    expect(sessionEnded).toBe(false);
    expect(scope.transactionalEntityManager.update).not.toHaveBeenCalled();
    expect(scope.billingService.chargeForResourceUsage).not.toHaveBeenCalled();
    expect(scope.mockAuditService.recordResource).not.toHaveBeenCalled();
    expect(scope.lifecycleAttempts.size).toBe(0);
    expect(scope.flowExecutorService.runFlow).toHaveBeenCalledWith(
      1,
      ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
      expect.any(Object),
      undefined,
      { lifecycleAttemptId: expect.any(String) },
    );
  });
}
