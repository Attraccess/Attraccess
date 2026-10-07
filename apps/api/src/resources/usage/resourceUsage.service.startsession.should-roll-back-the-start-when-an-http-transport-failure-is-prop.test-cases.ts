import {
  Resource,
  ResourceFlowNodeType,
  ResourceUsage,
  ResourceUsageAction,
  User,
} from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { ExternalEffectFailureError } from '../flows/errors/external-effect-failure.error';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { registerStartsessionScopeFixture } from './resourceUsage.service.startsession-28902f.test-fixture';
export function registerShouldRollBackTheStartWhenAnHttpTransportFailureIsPropCases(
  fixture: ReturnType<typeof registerStartsessionScopeFixture>,
) {
  it('should roll back the start when an HTTP transport failure is propagated', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session' };
    let transactionCommitted = false;

    fixture.fixture.flowExecutorService.runFlow.mockRejectedValueOnce(
      new ExternalEffectFailureError('HTTP dispatch failed', new Error('HTTP dispatch failed'), 'transport-dispatch'),
    );

    // Mock resourceRepository.findOne to return the resource
    fixture.fixture.resourceRepository.findOne.mockResolvedValue(fixture.mockResource);
    fixture.fixture.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    fixture.fixture.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
    fixture.fixture.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
    fixture.fixture.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
    fixture.fixture.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
    fixture.fixture.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

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
    fixture.fixture.resourceUsageRepository.findOne
      .mockResolvedValueOnce(null) // 1) getActiveSession
      .mockResolvedValueOnce(createdSession) // 2) fetch newly created session
      .mockResolvedValueOnce(finalizedSession) // 3) fetch finalized session for return
      .mockResolvedValueOnce(finalizedSession); // 4) emitUsageEvent fetch by id

    const mockQueryBuilder = fixture.fixture.createMockQueryBuilder(null);
    // Service uses transactionalEntityManager.createQueryBuilder, not repo
    (fixture.fixture.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );
    (fixture.fixture.resourceUsageRepository.manager.transaction as jest.Mock).mockImplementationOnce(
      async (callback) => {
        const result = await callback(fixture.fixture.transactionalEntityManager);
        transactionCommitted = true;
        return result;
      },
    );

    await expect(fixture.fixture.service.startSession(1, fixture.mockUser, dto)).rejects.toThrow(
      'HTTP dispatch failed',
    );
    expect(transactionCommitted).toBe(true);
    expect(fixture.fixture.lifecycleAttempts.size).toBe(0);
    expect(fixture.fixture.transactionalEntityManager.delete).toHaveBeenCalledWith(
      ResourceUsage,
      expect.objectContaining({ lifecyclePending: true }),
    );
    expect(fixture.fixture.transactionalEntityManager.createQueryBuilder).toHaveBeenCalled();
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
    });
    expect(mockQueryBuilder.execute).toHaveBeenCalled();
    expect(fixture.fixture.eventEmitter.emitAsync).not.toHaveBeenCalled();
    expect(fixture.fixture.flowExecutorService.trackResourceActivity).not.toHaveBeenCalled();
    expect(fixture.fixture.flowExecutorService.runFlow).toHaveBeenCalledWith(
      createdSession.resourceId,
      ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
      expect.any(Object),
      undefined,
      { lifecycleAttemptId: expect.any(String) },
    );
  });
}
