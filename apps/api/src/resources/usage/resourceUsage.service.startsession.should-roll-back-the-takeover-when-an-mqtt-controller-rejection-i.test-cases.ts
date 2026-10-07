import { ResourceFlowNodeType, ResourceUsage, ResourceUsageAction, User } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { ExternalEffectFailureError } from '../flows/errors/external-effect-failure.error';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { ResourceUsageSessionTakenOverEvent } from './events/resource-usage.events';
import { registerStartsessionScopeFixture } from './resourceUsage.service.startsession-28902f.test-fixture';
export function registerShouldRollBackTheTakeoverWhenAnMqttControllerRejectionIPart5Cases(
  fixture: ReturnType<typeof registerStartsessionScopeFixture>,
) {
  it('should roll back the takeover when an MQTT controller rejection is propagated', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session', forceTakeOver: true };
    let transactionCommitted = false;

    fixture.fixture.flowExecutorService.runFlow.mockRejectedValueOnce(
      new ExternalEffectFailureError(
        'MQTT controller rejected takeover',
        new Error('MQTT controller rejected takeover'),
        'controller-rejection',
      ),
    );

    // Mock resourceRepository.findOne to return the resource (allowTakeOver: true)
    fixture.fixture.resourceRepository.findOne.mockResolvedValue(fixture.mockResourceWithTakeOver);
    fixture.fixture.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    fixture.fixture.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
    fixture.fixture.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
    fixture.fixture.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
    fixture.fixture.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
    fixture.fixture.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

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
    fixture.fixture.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession) // 1) getActiveSession
      .mockResolvedValueOnce(mockNewUsage) // candidate in prepare
      .mockResolvedValueOnce(updatedEndedSession) // previous session at finish
      .mockResolvedValueOnce(finalizedNewUsage) // 4) fetch finalized new session (in-transaction)
      .mockResolvedValueOnce(updatedEndedSession) // 5) emitUsageEvent fetch for ended session (after commit)
      .mockResolvedValueOnce(finalizedNewUsage) // 6) emitUsageEvent fetch for newly created session (after commit)
      .mockResolvedValueOnce(finalizedNewUsage); // 7) safeguard for any additional fetches

    const mockUpdateQueryBuilder = fixture.fixture.createMockQueryBuilder(null);
    const mockInsertQueryBuilder = fixture.fixture.createMockQueryBuilder(null);

    // Service uses transactionalEntityManager.createQueryBuilder
    (fixture.fixture.transactionalEntityManager.createQueryBuilder as jest.Mock)
      .mockReturnValueOnce(mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>) // For ending session
      .mockReturnValueOnce(mockInsertQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>); // For creating new session
    (fixture.fixture.resourceUsageRepository.manager.transaction as jest.Mock).mockImplementationOnce(
      async (callback) => {
        const result = await callback(fixture.fixture.transactionalEntityManager);
        transactionCommitted = true;
        return result;
      },
    );

    await expect(fixture.fixture.service.startSession(1, fixture.mockUser, dto)).rejects.toThrow(
      'MQTT controller rejected takeover',
    );
    expect(transactionCommitted).toBe(true);
    expect(fixture.fixture.lifecycleAttempts.size).toBe(0);
    expect(fixture.fixture.transactionalEntityManager.delete).toHaveBeenCalledWith(
      ResourceUsage,
      expect.objectContaining({ lifecyclePending: true }),
    );
    expect(fixture.fixture.billingService.chargeForResourceUsage).not.toHaveBeenCalled();
    expect(fixture.fixture.billingService.handleResourceUsageStart).not.toHaveBeenCalled();
    expect(fixture.fixture.eventEmitter.emitAsync).not.toHaveBeenCalled();
    expect(fixture.fixture.eventEmitter.emit).not.toHaveBeenCalledWith(
      ResourceUsageSessionTakenOverEvent.EVENT_NAME,
      expect.any(Object),
    );
    expect(fixture.fixture.flowExecutorService.trackResourceActivity).not.toHaveBeenCalled();
    expect(fixture.fixture.flowExecutorService.runFlow).toHaveBeenCalledWith(
      mockActiveSession.resourceId,
      ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER,
      expect.any(Object),
      undefined,
      { lifecycleAttemptId: expect.any(String) },
    );
  });
}
