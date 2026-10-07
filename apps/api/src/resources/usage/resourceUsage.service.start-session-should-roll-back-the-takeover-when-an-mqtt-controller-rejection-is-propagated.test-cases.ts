import { ResourceUsage, ResourceUsageAction, User, ResourceFlowNodeType } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { ResourceUsageSessionTakenOverEvent } from './events/resource-usage.events';
import { ExternalEffectFailureError } from '../flows/errors/external-effect-failure.error';
import { StartSessionTestScope } from './resourceUsage.service.spec';
export function registerStartSessionShouldRollBackTheTakeoverWhenAnMqttControllerRejectionIsPropagated(
  scope: StartSessionTestScope,
): void {
  it('should roll back the takeover when an MQTT controller rejection is propagated', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session', forceTakeOver: true };
    let transactionCommitted = false;

    scope.flowExecutorService.runFlow.mockRejectedValueOnce(
      new ExternalEffectFailureError(
        'MQTT controller rejected takeover',
        new Error('MQTT controller rejected takeover'),
        'controller-rejection',
      ),
    );

    // Mock resourceRepository.findOne to return the resource (allowTakeOver: true)
    scope.resourceRepository.findOne.mockResolvedValue(scope.mockResourceWithTakeOver);
    scope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    scope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
    scope.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
    scope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
    scope.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
    scope.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

    const mockActiveSession = {
      id: 1,
      resourceId: 1,
      userId: 2,
      startTime: new Date(),
      user: { id: 2 } as User,
    } as ResourceUsage;
    const updatedEndedSession = {
      ...mockActiveSession,
      endTime: new Date(),
      endNotes: 'Session ended due to takeover by user 1',
    } as ResourceUsage;
    const mockNewUsage = {
      id: 2,
      resourceId: 1,
      userId: 1,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date(),
      endTime: null,
      isFinalized: false,
      user: { id: 1 } as User,
    } as ResourceUsage;
    const finalizedNewUsage = { ...mockNewUsage, isFinalized: true };

    // Mock getActiveSession to return an active session, then mock findOne for new session
    scope.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession) // 1) getActiveSession
      .mockResolvedValueOnce(mockNewUsage) // candidate in prepare
      .mockResolvedValueOnce(updatedEndedSession) // previous session at finish
      .mockResolvedValueOnce(finalizedNewUsage) // 4) fetch finalized new session (in-transaction)
      .mockResolvedValueOnce(updatedEndedSession) // 5) emitUsageEvent fetch for ended session (after commit)
      .mockResolvedValueOnce(finalizedNewUsage) // 6) emitUsageEvent fetch for newly created session (after commit)
      .mockResolvedValueOnce(finalizedNewUsage); // 7) safeguard for any additional fetches

    const mockUpdateQueryBuilder = scope.createMockQueryBuilder(null);
    const mockInsertQueryBuilder = scope.createMockQueryBuilder(null);

    // Service uses transactionalEntityManager.createQueryBuilder
    (scope.transactionalEntityManager.createQueryBuilder as jest.Mock)
      .mockReturnValueOnce(mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>) // For ending session
      .mockReturnValueOnce(mockInsertQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>); // For creating new session
    (scope.resourceUsageRepository.manager.transaction as jest.Mock).mockImplementationOnce(async (callback) => {
      const result = await callback(scope.transactionalEntityManager);
      transactionCommitted = true;
      return result;
    });

    await expect(scope.service.startSession(1, scope.mockUser, dto)).rejects.toThrow(
      'MQTT controller rejected takeover',
    );
    expect(transactionCommitted).toBe(true);
    expect(scope.lifecycleAttempts.size).toBe(0);
    expect(scope.transactionalEntityManager.delete).toHaveBeenCalledWith(
      ResourceUsage,
      expect.objectContaining({ lifecyclePending: true }),
    );
    expect(scope.billingService.chargeForResourceUsage).not.toHaveBeenCalled();
    expect(scope.billingService.handleResourceUsageStart).not.toHaveBeenCalled();
    expect(scope.eventEmitter.emitAsync).not.toHaveBeenCalled();
    expect(scope.eventEmitter.emit).not.toHaveBeenCalledWith(
      ResourceUsageSessionTakenOverEvent.EVENT_NAME,
      expect.any(Object),
    );
    expect(scope.flowExecutorService.trackResourceActivity).not.toHaveBeenCalled();
    expect(scope.flowExecutorService.runFlow).toHaveBeenCalledWith(
      mockActiveSession.resourceId,
      ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER,
      expect.any(Object),
      undefined,
      { lifecycleAttemptId: expect.any(String) },
    );
  });
}
