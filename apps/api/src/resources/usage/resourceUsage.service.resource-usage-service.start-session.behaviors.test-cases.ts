import { registerStartsessionScopeFixture } from './resourceUsage.service.startsession-28902f.test-fixture';
import { registerShouldAllowMaintenanceUsersToStartASessionEvenWhenResouPart10Cases } from './resourceUsage.service.resource-usage-service.start-session.behaviors.test-cases';
import { registerShouldAllowUsageWhenResourceIsUnderMaintenanceButUserCaPart11Cases } from './resourceUsage.service.resource-usage-service.start-session.behaviors.test-cases';
import { registerShouldBlockNonMaintenanceUsersWhenActiveMaintenanceExistsPart8Cases } from './resourceUsage.service.resource-usage-service.start-session.behaviors.test-cases';
import { registerShouldRejectStartWhenBillingIsEnabledAndBalanceIsInsuffPart12Cases } from './resourceUsage.service.resource-usage-service.start-session.behaviors.test-cases';
import { registerShouldRollBackTheStartWhenAnHttpTransportFailureIsPropCases } from './resourceUsage.service.startsession.should-roll-back-the-start-when-an-http-transport-failure-is-prop.test-cases';
import { registerShouldRollBackTheTakeoverWhenAnMqttControllerRejectionIPart5Cases } from './resourceUsage.service.startsession.should-roll-back-the-takeover-when-an-mqtt-controller-rejection-i.test-cases';
import { registerShouldStartWhenBillingIsEnabledAndBalanceIsSufficientPart13Cases } from './resourceUsage.service.startsession.should-start-when-billing-is-enabled-and-balance-is-sufficient.behaviors.test-cases';
import { registerShouldThrowErrorWhenActiveSessionExistsAndNoTakeoverReqPart3Cases } from './resourceUsage.service.startsession.should-start-when-billing-is-enabled-and-balance-is-sufficient.behaviors.test-cases';
import { registerShouldThrowErrorWhenResourceDoesNotExistPart1Cases } from './resourceUsage.service.startsession.should-start-when-billing-is-enabled-and-balance-is-sufficient.behaviors.test-cases';
import { registerShouldThrowErrorWhenTakeoverRequestedButResourceDoesNotPart4Cases } from './resourceUsage.service.startsession.should-start-when-billing-is-enabled-and-balance-is-sufficient.behaviors.test-cases';
import { registerShouldThrowErrorWhenUserHasNotCompletedIntroductionPart2Cases } from './resourceUsage.service.startsession.should-start-when-billing-is-enabled-and-balance-is-sufficient.behaviors.test-cases';
import { registerShouldThrowResourcemaintenanceinuseexceptionWhenResourceIsUPart7Cases } from './resourceUsage.service.startsession.should-start-when-billing-is-enabled-and-balance-is-sufficient.behaviors.test-cases';
import { registerShouldThrowResourceunhealthyexceptionWhenResourceIsUnhealthPart9Cases } from './resourceUsage.service.startsession.should-start-when-billing-is-enabled-and-balance-is-sufficient.behaviors.test-cases';
import { registerShouldTriggerOnlyTakeoverFlowOnTakeoverAndNotStartedStoPart6Cases } from './resourceUsage.service.startsession.should-trigger-only-takeover-flow-on-takeover-and-not-started-sto.test-cases';
import { registerResourceUsageServiceFixture } from './resourceUsage.service.resource-usage-service.test-fixture';
import { ResourceUsage, ResourceUsageAction, User, Resource, ResourceType } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { ResourceUsageImpossibleMaintenanceInProgressException } from '../../exceptions/resource.maintenance.inUse.exception';
import { InsufficientBalanceError } from '../../billing/errors/insufficient-balance.error';

export function registerStartSessionCases(fixture: ReturnType<typeof registerResourceUsageServiceFixture>) {
  describe('startSession', () => {
    const scope = registerStartsessionScopeFixture(fixture);
    registerShouldRollBackTheStartWhenAnHttpTransportFailureIsPropCases(scope);
    registerShouldThrowErrorWhenResourceDoesNotExistPart1Cases(scope);
    registerShouldThrowErrorWhenUserHasNotCompletedIntroductionPart2Cases(scope);
    registerShouldThrowErrorWhenActiveSessionExistsAndNoTakeoverReqPart3Cases(scope);
    registerShouldThrowErrorWhenTakeoverRequestedButResourceDoesNotPart4Cases(scope);
    registerShouldRollBackTheTakeoverWhenAnMqttControllerRejectionIPart5Cases(scope);
    registerShouldTriggerOnlyTakeoverFlowOnTakeoverAndNotStartedStoPart6Cases(scope);
    registerShouldThrowResourcemaintenanceinuseexceptionWhenResourceIsUPart7Cases(scope);
    registerShouldBlockNonMaintenanceUsersWhenActiveMaintenanceExistsPart8Cases(scope);
    registerShouldThrowResourceunhealthyexceptionWhenResourceIsUnhealthPart9Cases(scope);
    registerShouldAllowMaintenanceUsersToStartASessionEvenWhenResouPart10Cases(scope);
    registerShouldAllowUsageWhenResourceIsUnderMaintenanceButUserCaPart11Cases(scope);
    registerShouldRejectStartWhenBillingIsEnabledAndBalanceIsInsuffPart12Cases(scope);
    registerShouldStartWhenBillingIsEnabledAndBalanceIsSufficientPart13Cases(scope);
  });
}

export function registerShouldAllowMaintenanceUsersToStartASessionEvenWhenResouPart10Cases(
  fixture: ReturnType<typeof registerStartsessionScopeFixture>,
) {
  it('should allow maintenance users to start a session even when resource is unhealthy', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session' };

    fixture.fixture.resourceRepository.findOne.mockResolvedValue(fixture.mockResource);
    fixture.fixture.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    fixture.fixture.mockResourceHealthService.isResourceUnhealthy.mockResolvedValueOnce(true);
    fixture.fixture.resourceMaintenanceService.canManageMaintenance.mockResolvedValue(true);

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
      startTime: new Date(),
      endTime: null,
      isFinalized: false,
      user: { id: 1, billingFactor: 100 } as User,
    } as ResourceUsage;
    const finalizedSession = { ...createdSession, isFinalized: true };

    fixture.fixture.resourceUsageRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(createdSession)
      .mockResolvedValueOnce(finalizedSession)
      .mockResolvedValueOnce(finalizedSession);

    const mockQueryBuilder = fixture.fixture.createMockQueryBuilder(null);
    (fixture.fixture.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );

    const result = await fixture.fixture.service.startSession(1, fixture.mockUser, dto);
    expect(result).toEqual(finalizedSession);
  });
}

export function registerShouldAllowUsageWhenResourceIsUnderMaintenanceButUserCaPart11Cases(
  fixture: ReturnType<typeof registerStartsessionScopeFixture>,
) {
  it('should allow usage when resource is under maintenance but user can manage maintenance', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session' };

    // Mock resourceRepository.findOne to return the resource
    fixture.fixture.resourceRepository.findOne.mockResolvedValue(fixture.mockResource);

    // Mock maintenance service to indicate active maintenance but user can manage
    fixture.fixture.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(true);
    fixture.fixture.resourceMaintenanceService.canManageMaintenance.mockResolvedValue(true);

    // Mock other required services
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
      startTime: new Date(),
      endTime: null,
      isFinalized: false,
      user: { id: 1, billingFactor: 100 } as User,
    } as ResourceUsage;
    const finalizedSession = { ...createdSession, isFinalized: true };

    // Mock getActiveSession to return null (no active session)
    fixture.fixture.resourceUsageRepository.findOne
      .mockResolvedValueOnce(null) // For getActiveSession
      .mockResolvedValueOnce(createdSession) // For finding new session
      .mockResolvedValueOnce(finalizedSession) // Fetch finalized session for return
      .mockResolvedValueOnce(finalizedSession); // Emit event after commit

    const mockQueryBuilder = fixture.fixture.createMockQueryBuilder(null);
    (fixture.fixture.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );

    const result = await fixture.fixture.service.startSession(1, fixture.mockUser, dto);

    expect(result).toEqual(finalizedSession);
    expect(fixture.fixture.resourceMaintenanceService.hasActiveMaintenance).toHaveBeenCalledWith(1, expect.anything());
    expect(fixture.fixture.resourceMaintenanceService.canManageMaintenance).toHaveBeenCalledWith(
      fixture.mockUser,
      1,
      expect.anything(),
    );
    expect(fixture.fixture.flowExecutorService.trackResourceActivity).toHaveBeenCalledWith(createdSession.resourceId);
  });
}

export function registerShouldBlockNonMaintenanceUsersWhenActiveMaintenanceExistsPart8Cases(
  fixture: ReturnType<typeof registerStartsessionScopeFixture>,
) {
  it('should block non-maintenance users when active maintenance exists including schedule-triggered (same as manual)', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session' };

    fixture.fixture.resourceRepository.findOne.mockResolvedValue(fixture.mockResource);
    // hasActiveMaintenance does not filter by origin: schedule-created maintenances use the same
    // table and criteria (startTime <= now, endTime IS NULL), so they block the same as manual ones
    fixture.fixture.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(true);
    fixture.fixture.resourceMaintenanceService.canManageMaintenance.mockResolvedValue(false);

    await expect(fixture.fixture.service.startSession(1, fixture.mockUser, dto)).rejects.toThrow(
      ResourceUsageImpossibleMaintenanceInProgressException,
    );
    expect(fixture.fixture.resourceMaintenanceService.hasActiveMaintenance).toHaveBeenCalledWith(1, expect.anything());
    expect(fixture.fixture.resourceMaintenanceService.canManageMaintenance).toHaveBeenCalledWith(
      fixture.mockUser,
      1,
      expect.anything(),
    );
  });
}

export function registerShouldRejectStartWhenBillingIsEnabledAndBalanceIsInsuffPart12Cases(
  fixture: ReturnType<typeof registerStartsessionScopeFixture>,
) {
  it('should reject start when billing is enabled and balance is insufficient', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session' };

    fixture.fixture.resourceRepository.findOne.mockResolvedValue({
      id: 1,
      name: 'Test Resource',
      allowTakeOver: false,
      type: ResourceType.Machine,
    } as Resource);
    fixture.fixture.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    fixture.fixture.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
    fixture.fixture.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
    fixture.fixture.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
    fixture.fixture.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
    fixture.fixture.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

    fixture.fixture.billingService.handleResourceUsageStart.mockRejectedValue(new InsufficientBalanceError());

    // getActiveSession -> null, then fetch newly created session
    fixture.fixture.resourceUsageRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 1,
      resourceId: 1,
      userId: 1,
      usageAction: ResourceUsageAction.Usage,
      endTime: null,
      user: { id: 1 } as User,
      resource: { id: 1 } as Resource,
    } as ResourceUsage);

    await expect(fixture.fixture.service.startSession(1, { id: 1 } as User, dto)).rejects.toBeInstanceOf(
      InsufficientBalanceError,
    );

    expect(fixture.fixture.billingService.handleResourceUsageStart).toHaveBeenCalled();
  });
}
