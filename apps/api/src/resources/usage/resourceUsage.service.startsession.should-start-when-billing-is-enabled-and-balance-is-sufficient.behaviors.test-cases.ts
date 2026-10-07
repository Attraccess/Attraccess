import { Resource, ResourceType, ResourceUsage, ResourceUsageAction, User } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { ResourceSessionStartedEvent } from './events/resource-usage.events';
import { registerStartsessionScopeFixture } from './resourceUsage.service.startsession-28902f.test-fixture';
import { ResourceInUseError } from './errors/resource-in-use.error';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';
import { BadRequestException } from '@nestjs/common';
import { ResourceUsageImpossibleMaintenanceInProgressException } from '../../exceptions/resource.maintenance.inUse.exception';

export function registerShouldStartWhenBillingIsEnabledAndBalanceIsSufficientPart13Cases(
  fixture: ReturnType<typeof registerStartsessionScopeFixture>,
) {
  it('should start when billing is enabled and balance is sufficient', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session' };

    const mockResource: Resource = {
      id: 1,
      name: 'Test Resource',
      allowTakeOver: false,
      type: ResourceType.Machine,
    } as Resource;

    fixture.fixture.resourceRepository.findOne.mockResolvedValue(mockResource);
    fixture.fixture.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    fixture.fixture.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
    fixture.fixture.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
    fixture.fixture.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
    fixture.fixture.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
    fixture.fixture.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

    fixture.fixture.billingService.handleResourceUsageStart.mockResolvedValue(undefined);

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
      .mockResolvedValueOnce(null) // For getActiveSession
      .mockResolvedValueOnce(createdSession) // For finding new session
      .mockResolvedValueOnce(finalizedSession) // For fetching finalized session to return
      .mockResolvedValueOnce(finalizedSession); // For emitUsageEvent

    const mockQueryBuilder = fixture.fixture.createMockQueryBuilder(null);
    (fixture.fixture.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );

    const result = await fixture.fixture.service.startSession(1, { id: 1 } as User, dto);

    expect(result).toMatchObject({ id: 1, resourceId: 1, userId: 1, endTime: null, isFinalized: true });
    expect(fixture.fixture.billingService.handleResourceUsageStart).toHaveBeenCalled();
    expect(mockQueryBuilder.insert).toHaveBeenCalled();
    expect(fixture.fixture.eventEmitter.emitAsync).toHaveBeenCalledWith(
      ResourceSessionStartedEvent.EVENT_NAME,
      expect.any(Object),
    );
    expect(fixture.fixture.flowExecutorService.trackResourceActivity).toHaveBeenCalledWith(createdSession.resourceId);
    expect(fixture.fixture.mockAuditService.recordResource).toHaveBeenCalledWith({
      action: 'usage_session.started',
      actorId: 1,
      authenticationMethod: 'session',
      subjectId: 1,
      details: { usageId: 1, usageUserId: 1 },
    });
  });
}

export function registerShouldThrowErrorWhenActiveSessionExistsAndNoTakeoverReqPart3Cases(
  fixture: ReturnType<typeof registerStartsessionScopeFixture>,
) {
  it('should throw error when active session exists and no takeover requested', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session' };

    // Mock resourceRepository.findOne to return the resource
    fixture.fixture.resourceRepository.findOne.mockResolvedValue(fixture.mockResource);
    fixture.fixture.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    fixture.fixture.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
    fixture.fixture.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
    fixture.fixture.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
    fixture.fixture.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
    fixture.fixture.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

    const mockActiveSession = { id: 1, userId: 2, user: { id: 2 } as User } as ResourceUsage;
    // Mock getActiveSession to return an active session
    fixture.fixture.resourceUsageRepository.findOne.mockResolvedValue(mockActiveSession);

    await expect(fixture.fixture.service.startSession(1, fixture.mockUser, dto)).rejects.toBeInstanceOf(
      ResourceInUseError,
    );
  });
}

export function registerShouldThrowErrorWhenResourceDoesNotExistPart1Cases(
  fixture: ReturnType<typeof registerStartsessionScopeFixture>,
) {
  it('should throw error when resource does not exist', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session' };

    // Mock resourceRepository.findOne to return null (resource not found)
    fixture.fixture.resourceRepository.findOne.mockResolvedValue(null);

    await expect(fixture.fixture.service.startSession(1, fixture.mockUser, dto)).rejects.toThrow(
      ResourceNotFoundException,
    );
  });
}

export function registerShouldThrowErrorWhenTakeoverRequestedButResourceDoesNotPart4Cases(
  fixture: ReturnType<typeof registerStartsessionScopeFixture>,
) {
  it('should throw error when takeover requested but resource does not allow it', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session', forceTakeOver: true };

    // Mock resourceRepository.findOne to return the resource (allowTakeOver: false)
    fixture.fixture.resourceRepository.findOne.mockResolvedValue(fixture.mockResource);
    fixture.fixture.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    fixture.fixture.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
    fixture.fixture.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
    fixture.fixture.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
    fixture.fixture.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
    fixture.fixture.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

    const mockActiveSession = { id: 1, userId: 2, user: { id: 2 } as User } as ResourceUsage;
    // Mock getActiveSession to return an active session
    fixture.fixture.resourceUsageRepository.findOne.mockResolvedValue(mockActiveSession);

    await expect(fixture.fixture.service.startSession(1, fixture.mockUser, dto)).rejects.toThrow(
      new BadRequestException('This resource does not allow overtaking'),
    );
  });
}

export function registerShouldThrowErrorWhenUserHasNotCompletedIntroductionPart2Cases(
  fixture: ReturnType<typeof registerStartsessionScopeFixture>,
) {
  it('should throw error when user has not completed introduction', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session' };

    // Mock resourceRepository.findOne to return the resource
    fixture.fixture.resourceRepository.findOne.mockResolvedValue(fixture.mockResource);
    fixture.fixture.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    fixture.fixture.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(false);
    fixture.fixture.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
    fixture.fixture.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
    fixture.fixture.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
    fixture.fixture.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

    await expect(fixture.fixture.service.startSession(1, fixture.mockUser, dto)).rejects.toThrow(BadRequestException);
    expect(fixture.fixture.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledWith(
      1,
      1,
      expect.anything(),
    );
  });
}

export function registerShouldThrowResourcemaintenanceinuseexceptionWhenResourceIsUPart7Cases(
  fixture: ReturnType<typeof registerStartsessionScopeFixture>,
) {
  it('should throw ResourceMaintenanceInUseException when resource is under maintenance and user cannot manage maintenance', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session' };

    // Mock resourceRepository.findOne to return the resource
    fixture.fixture.resourceRepository.findOne.mockResolvedValue(fixture.mockResource);

    // Mock maintenance service to indicate active maintenance
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

export function registerShouldThrowResourceunhealthyexceptionWhenResourceIsUnhealthPart9Cases(
  fixture: ReturnType<typeof registerStartsessionScopeFixture>,
) {
  it('should throw ResourceUnhealthyException when resource is unhealthy and user cannot manage maintenance', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session' };

    fixture.fixture.resourceRepository.findOne.mockResolvedValue(fixture.mockResource);
    fixture.fixture.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    fixture.fixture.mockResourceHealthService.isResourceUnhealthy.mockResolvedValueOnce(true);
    fixture.fixture.resourceMaintenanceService.canManageMaintenance.mockResolvedValue(false);

    const { ResourceUnhealthyException } = require('../../exceptions/resource.unhealthy.exception');

    await expect(fixture.fixture.service.startSession(1, fixture.mockUser, dto)).rejects.toBeInstanceOf(
      ResourceUnhealthyException,
    );
    expect(fixture.fixture.mockResourceHealthService.isResourceUnhealthy).toHaveBeenCalledWith(1);
    expect(fixture.fixture.resourceMaintenanceService.canManageMaintenance).toHaveBeenCalled();
  });
}
