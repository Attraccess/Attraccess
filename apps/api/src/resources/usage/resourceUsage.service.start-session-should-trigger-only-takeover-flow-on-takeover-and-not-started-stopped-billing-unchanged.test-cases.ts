import { ResourceUsage, User, ResourceFlowNodeType } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { StartSessionTestScope } from './resourceUsage.service.spec';
export function registerStartSessionShouldTriggerOnlyTakeoverFlowOnTakeoverAndNotStartedStoppedBillingUnchanged(
  scope: StartSessionTestScope,
): void {
  it('should trigger only TAKEOVER flow on takeover and not STARTED/STOPPED; billing unchanged', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session', forceTakeOver: true };

    scope.resourceRepository.findOne.mockResolvedValue(scope.mockResourceWithTakeOver);
    scope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    scope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
    scope.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
    scope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
    scope.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
    scope.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

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

    scope.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession) // getActiveSession
      .mockResolvedValueOnce(mockNewUsage) // candidate in prepare
      .mockResolvedValueOnce(updatedEndedSession) // previous session at finish
      .mockResolvedValueOnce(mockNewUsage) // finalized candidate
      .mockResolvedValueOnce(updatedEndedSession) // emitUsageEvent for ended
      .mockResolvedValueOnce(mockNewUsage); // emitUsageEvent for started

    const mockUpdateQueryBuilder = scope.createMockQueryBuilder(null);
    const mockInsertQueryBuilder = scope.createMockQueryBuilder(null);

    (scope.transactionalEntityManager.createQueryBuilder as jest.Mock)
      .mockReturnValueOnce(mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>)
      .mockReturnValueOnce(mockInsertQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>);

    await scope.service.startSession(1, scope.mockUser, dto);

    // Only one flow call and it must be TAKEOVER
    expect(scope.flowExecutorService.runFlow).toHaveBeenCalledTimes(1);
    const [resId, nodeType, payload] = scope.flowExecutorService.runFlow.mock.calls[0];
    expect(resId).toBe(mockActiveSession.resourceId ?? 1);
    expect(nodeType).toBe(ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER);
    expect(payload).toMatchObject({ newUser: { id: scope.mockUser.id }, oldUser: { id: mockActiveSession.user.id } });

    // Billing start should still be called exactly once for the new session
    expect(scope.billingService.handleResourceUsageStart).toHaveBeenCalledTimes(1);
    // Billing charge should occur for previous ended session exactly once
    expect(scope.billingService.chargeForResourceUsage).toHaveBeenCalledTimes(1);
    const chargedArg = (scope.billingService.chargeForResourceUsage as unknown as jest.Mock).mock
      .calls[0][0] as ResourceUsage;
    expect(chargedArg.user?.id).toBe(mockActiveSession.user.id);
    const chargedIds = (scope.billingService.chargeForResourceUsage as unknown as jest.Mock).mock.calls.map(
      (c) => c[0]?.id,
    );
    expect(chargedIds).not.toContain(mockNewUsage.id);
    expect(scope.flowExecutorService.trackResourceActivity).toHaveBeenCalledTimes(1);
    expect(scope.flowExecutorService.trackResourceActivity).toHaveBeenCalledWith(mockNewUsage.resourceId);
  });
}
