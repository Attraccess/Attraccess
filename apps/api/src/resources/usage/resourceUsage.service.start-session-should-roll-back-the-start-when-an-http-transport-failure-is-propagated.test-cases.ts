import {
  Resource,
  ResourceUsage,
  ResourceUsageAction,
  User,
  ResourceFlowNodeType,
} from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { ExternalEffectFailureError } from '../flows/errors/external-effect-failure.error';
import { StartSessionTestScope } from './resourceUsage.service.spec';
export function registerStartSessionShouldRollBackTheStartWhenAnHttpTransportFailureIsPropagated(
  scope: StartSessionTestScope,
): void {
  it('should roll back the start when an HTTP transport failure is propagated', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session' };
    let transactionCommitted = false;

    scope.flowExecutorService.runFlow.mockRejectedValueOnce(
      new ExternalEffectFailureError('HTTP dispatch failed', new Error('HTTP dispatch failed'), 'transport-dispatch'),
    );

    // Mock resourceRepository.findOne to return the resource
    scope.resourceRepository.findOne.mockResolvedValue(scope.mockResource);
    scope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    scope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
    scope.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
    scope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
    scope.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
    scope.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

    const createdSession = {
      id: 1,
      resourceId: 1,
      userId: 1,
      usageAction: ResourceUsageAction.Usage,
      endTime: null,
      startTime: new Date(),
      isFinalized: false,
      user: { id: 1 } as User,
      resource: { id: 1 } as Resource,
    } as ResourceUsage;
    const finalizedSession = { ...createdSession, isFinalized: true };

    // Mock getActiveSession to return null (no active session)
    scope.resourceUsageRepository.findOne
      .mockResolvedValueOnce(null) // 1) getActiveSession
      .mockResolvedValueOnce(createdSession) // 2) fetch newly created session
      .mockResolvedValueOnce(finalizedSession) // 3) fetch finalized session for return
      .mockResolvedValueOnce(finalizedSession); // 4) emitUsageEvent fetch by id

    const mockQueryBuilder = scope.createMockQueryBuilder(null);
    // Service uses transactionalEntityManager.createQueryBuilder, not repo
    (scope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );
    (scope.resourceUsageRepository.manager.transaction as jest.Mock).mockImplementationOnce(async (callback) => {
      const result = await callback(scope.transactionalEntityManager);
      transactionCommitted = true;
      return result;
    });

    await expect(scope.service.startSession(1, scope.mockUser, dto)).rejects.toThrow('HTTP dispatch failed');
    expect(transactionCommitted).toBe(true);
    expect(scope.lifecycleAttempts.size).toBe(0);
    expect(scope.transactionalEntityManager.delete).toHaveBeenCalledWith(
      ResourceUsage,
      expect.objectContaining({ lifecyclePending: true }),
    );
    expect(scope.transactionalEntityManager.createQueryBuilder).toHaveBeenCalled();
    expect(mockQueryBuilder.insert).toHaveBeenCalled();
    expect(mockQueryBuilder.into).toHaveBeenCalledWith(ResourceUsage);
    expect(mockQueryBuilder.values).toHaveBeenCalledWith({
      resourceId: 1,
      usageAction: ResourceUsageAction.Usage,
      userId: 1,
      startNotes: 'Test session',
      startTime: expect.any(Date),
      endTime: null,
      endNotes: null,
      isFinalized: false,
      lifecyclePending: true,
      sessionDurationCreditsPerMinute: 0,
      operatingDurationCreditsPerMinute: 0,
      creditsPerUsage: 0,
      meterRates: [],
    });
    expect(mockQueryBuilder.execute).toHaveBeenCalled();
    expect(scope.eventEmitter.emitAsync).not.toHaveBeenCalled();
    expect(scope.flowExecutorService.trackResourceActivity).not.toHaveBeenCalled();
    expect(scope.flowExecutorService.runFlow).toHaveBeenCalledWith(
      createdSession.resourceId,
      ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
      expect.any(Object),
      undefined,
      { lifecycleAttemptId: expect.any(String) },
    );
  });
}
