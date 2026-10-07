import { ResourceFlowNodeType, ResourceUsage, User } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { registerStartsessionScopeFixture } from './resourceUsage.service.startsession-28902f.test-fixture';
export function registerShouldTriggerOnlyTakeoverFlowOnTakeoverAndNotStartedStoPart6Cases(
  fixture: ReturnType<typeof registerStartsessionScopeFixture>,
) {
  it('should trigger only TAKEOVER flow on takeover and not STARTED/STOPPED; billing unchanged', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session', forceTakeOver: true };

    fixture.fixture.resourceRepository.findOne.mockResolvedValue(fixture.mockResourceWithTakeOver);
    fixture.fixture.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    fixture.fixture.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
    fixture.fixture.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
    fixture.fixture.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
    fixture.fixture.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
    fixture.fixture.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

    const mockActiveSession = {
      id: 10,
      resourceId: 1,
      userId: 9,
      startTime: new Date(),
      user: { id: 9 } as User,
    } as ResourceUsage;
    const updatedEndedSession = {
      ...mockActiveSession,
      endTime: new Date(),
      endNotes: 'Session ended due to takeover by user 1',
    } as ResourceUsage;
    const mockNewUsage = { id: 11, resourceId: 1, userId: 1, user: { id: 1, billingFactor: 100 } } as ResourceUsage;

    fixture.fixture.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession) // getActiveSession
      .mockResolvedValueOnce(mockNewUsage) // candidate in prepare
      .mockResolvedValueOnce(updatedEndedSession) // previous session at finish
      .mockResolvedValueOnce(mockNewUsage) // finalized candidate
      .mockResolvedValueOnce(updatedEndedSession) // emitUsageEvent for ended
      .mockResolvedValueOnce(mockNewUsage); // emitUsageEvent for started

    const mockUpdateQueryBuilder = fixture.fixture.createMockQueryBuilder(null);
    const mockInsertQueryBuilder = fixture.fixture.createMockQueryBuilder(null);

    (fixture.fixture.transactionalEntityManager.createQueryBuilder as jest.Mock)
      .mockReturnValueOnce(mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>)
      .mockReturnValueOnce(mockInsertQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>);

    await fixture.fixture.service.startSession(1, fixture.mockUser, dto);

    // Only one flow call and it must be TAKEOVER
    expect(fixture.fixture.flowExecutorService.runFlow).toHaveBeenCalledTimes(1);
    const [resId, nodeType, payload] = fixture.fixture.flowExecutorService.runFlow.mock.calls[0];
    expect(resId).toBe(mockActiveSession.resourceId ?? 1);
    expect(nodeType).toBe(ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER);
    expect(payload).toMatchObject({ newUser: { id: fixture.mockUser.id }, oldUser: { id: mockActiveSession.user.id } });

    // Billing start should still be called exactly once for the new session
    expect(fixture.fixture.billingService.handleResourceUsageStart).toHaveBeenCalledTimes(1);
    // Billing charge should occur for previous ended session exactly once
    expect(fixture.fixture.billingService.chargeForResourceUsage).toHaveBeenCalledTimes(1);
    const chargedArg = (fixture.fixture.billingService.chargeForResourceUsage as unknown as jest.Mock).mock
      .calls[0][0] as ResourceUsage;
    expect(chargedArg.user?.id).toBe(mockActiveSession.user.id);
    const chargedIds = (fixture.fixture.billingService.chargeForResourceUsage as unknown as jest.Mock).mock.calls.map(
      (c) => c[0]?.id,
    );
    expect(chargedIds).not.toContain(mockNewUsage.id);
    expect(fixture.fixture.flowExecutorService.trackResourceActivity).toHaveBeenCalledTimes(1);
    expect(fixture.fixture.flowExecutorService.trackResourceActivity).toHaveBeenCalledWith(mockNewUsage.resourceId);
  });
}
