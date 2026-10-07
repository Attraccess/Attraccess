import { ResourceFlowNodeType, ResourceUsage, User } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { EndUsageSessionDto } from './dtos/endUsageSession.dto';
import { registerEndsessionScopeFixture } from './resourceUsage.service.endsession-9b9974.test-fixture';
import { ResourceSessionStartedEvent } from './events/resource-usage.events';

export function registerAllowsGroupIntroducersToEndSessionsOwnedByOthersPart13Cases(
  fixture: ReturnType<typeof registerEndsessionScopeFixture>,
) {
  it('allows group introducers to end sessions owned by others', async () => {
    const dto: EndUsageSessionDto = { notes: 'Group introducer stop' };
    const sessionOwner = { id: 51, username: 'owner' } as User;
    const groupIntroducer = { id: 91, username: 'group-introducer' } as User;
    const mockActiveSession = {
      id: 7,
      resourceId: 33,
      userId: sessionOwner.id,
      startTime: new Date(),
      user: sessionOwner,
    } as ResourceUsage;
    const prefixedNotes = `[By #${groupIntroducer.id} - ${groupIntroducer.username}] ${dto.notes}`;
    const mockUpdatedSession = {
      ...mockActiveSession,
      endTime: new Date(),
      endNotes: prefixedNotes,
    };

    fixture.fixture.resourceIntroducersService.canMaintain.mockImplementation(
      async (_resId, _userId, includeGroupIntroducers) => (includeGroupIntroducers ? true : false),
    );
    fixture.fixture.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession)
      .mockResolvedValueOnce(mockUpdatedSession)
      .mockResolvedValueOnce(mockUpdatedSession);

    const mockUpdateQueryBuilder = fixture.fixture.createMockQueryBuilder(null);
    (fixture.fixture.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );

    const result = await fixture.fixture.service.endSession(mockActiveSession.resourceId, groupIntroducer, dto);

    expect(result).toBe(mockUpdatedSession);
    expect(fixture.fixture.resourceIntroducersService.canMaintain).toHaveBeenCalledWith(
      mockActiveSession.resourceId,
      groupIntroducer.id,
      true,
    );
    await expect(fixture.fixture.resourceIntroducersService.canMaintain.mock.results.at(-1)?.value).resolves.toBe(true);
    expect(fixture.fixture.flowExecutorService.runFlow).toHaveBeenCalledWith(
      mockActiveSession.resourceId,
      ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
      expect.objectContaining({ endNotes: prefixedNotes }),
      undefined,
      { lifecycleAttemptId: expect.any(String) },
    );
  });
}

export function registerAllowsResourceIntroducersAndMaintainersToEndSessionsOwnedPart12Cases(
  fixture: ReturnType<typeof registerEndsessionScopeFixture>,
) {
  it('allows resource introducers and maintainers to end sessions owned by others', async () => {
    const dto: EndUsageSessionDto = { notes: 'Introducer stop' };
    const sessionOwner = { id: 31, username: 'member' } as User;
    const introducerUser = { id: 44, username: 'resource-introducer' } as User;
    const mockActiveSession = {
      id: 6,
      resourceId: 22,
      userId: sessionOwner.id,
      startTime: new Date(),
      user: sessionOwner,
    } as ResourceUsage;
    const prefixedNotes = `[By #${introducerUser.id} - ${introducerUser.username}] ${dto.notes}`;
    const mockUpdatedSession = {
      ...mockActiveSession,
      endTime: new Date(),
      endNotes: prefixedNotes,
    };

    fixture.fixture.resourceIntroducersService.canMaintain.mockResolvedValue(true);
    fixture.fixture.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession)
      .mockResolvedValueOnce(mockUpdatedSession)
      .mockResolvedValueOnce(mockUpdatedSession);

    const mockUpdateQueryBuilder = fixture.fixture.createMockQueryBuilder(null);
    (fixture.fixture.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );

    const result = await fixture.fixture.service.endSession(mockActiveSession.resourceId, introducerUser, dto);

    expect(result).toBe(mockUpdatedSession);
    expect(fixture.fixture.resourceIntroducersService.canMaintain).toHaveBeenCalledWith(
      mockActiveSession.resourceId,
      introducerUser.id,
      true,
    );
    expect(fixture.fixture.flowExecutorService.runFlow).toHaveBeenCalledWith(
      mockActiveSession.resourceId,
      ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
      expect.objectContaining({ endNotes: prefixedNotes }),
      undefined,
      { lifecycleAttemptId: expect.any(String) },
    );
  });
}

export function registerAllowsTheSupervisorOfASupervisedSessionToEndItWithoutAPart14Cases(
  fixture: ReturnType<typeof registerEndsessionScopeFixture>,
) {
  it('allows the supervisor of a supervised session to end it without an introducer role', async () => {
    const dto: EndUsageSessionDto = { notes: 'Supervisor stop' };
    const sessionOwner = { id: 60, username: 'student' } as User;
    const supervisorUser = { id: 61, username: 'supervisor' } as User;
    const mockActiveSession = {
      id: 9,
      resourceId: 40,
      userId: sessionOwner.id,
      supervisorUserId: supervisorUser.id,
      startTime: new Date(),
      user: sessionOwner,
    } as ResourceUsage;
    const prefixedNotes = `[By #${supervisorUser.id} - ${supervisorUser.username}] ${dto.notes}`;
    const mockUpdatedSession = { ...mockActiveSession, endTime: new Date(), endNotes: prefixedNotes };

    fixture.fixture.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession)
      .mockResolvedValueOnce(mockUpdatedSession)
      .mockResolvedValueOnce(mockUpdatedSession);

    const mockUpdateQueryBuilder = fixture.fixture.createMockQueryBuilder(null);
    (fixture.fixture.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );

    const result = await fixture.fixture.service.endSession(mockActiveSession.resourceId, supervisorUser, dto);

    expect(result).toBe(mockUpdatedSession);
    // The supervisor short-circuits the authorization check; no introducer lookup needed.
    expect(fixture.fixture.resourceIntroducersService.canMaintain).not.toHaveBeenCalled();
    expect(fixture.fixture.flowExecutorService.runFlow).toHaveBeenCalledWith(
      mockActiveSession.resourceId,
      ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
      expect.objectContaining({ endNotes: prefixedNotes }),
      undefined,
      { lifecycleAttemptId: expect.any(String) },
    );
  });
}

export function registerAllowsUsersWithResourcesUpdatePermissionToEndSessionsOwnPart11Cases(
  fixture: ReturnType<typeof registerEndsessionScopeFixture>,
) {
  it('allows users with resources.update permission to end sessions owned by others', async () => {
    const dto: EndUsageSessionDto = { notes: 'Manual stop' };
    const sessionOwner = { id: 77, username: 'member' } as User;
    const managerUser = {
      id: 88,
      username: 'manager',
    } as User;
    fixture.fixture.mockRbacService.getEffectivePermissions.mockResolvedValue(new Set(['resources.update']));
    const mockActiveSession = {
      id: 5,
      resourceId: 12,
      userId: sessionOwner.id,
      startTime: new Date(),
      user: sessionOwner,
    } as ResourceUsage;
    const prefixedNotes = `[By #${managerUser.id} - ${managerUser.username}] ${dto.notes}`;
    const mockUpdatedSession = {
      ...mockActiveSession,
      endTime: new Date(),
      endNotes: prefixedNotes,
    };

    fixture.fixture.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
    fixture.fixture.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession)
      .mockResolvedValueOnce(mockUpdatedSession)
      .mockResolvedValueOnce(mockUpdatedSession);

    const mockUpdateQueryBuilder = fixture.fixture.createMockQueryBuilder(null);
    (fixture.fixture.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );

    const result = await fixture.fixture.service.endSession(mockActiveSession.resourceId, managerUser, dto);

    expect(result).toBe(mockUpdatedSession);
    expect(fixture.fixture.resourceIntroducersService.canMaintain).not.toHaveBeenCalled();
    expect(fixture.fixture.transactionalEntityManager.update).toHaveBeenCalled();
    expect(fixture.fixture.billingService.chargeForResourceUsage).toHaveBeenCalledWith(
      mockUpdatedSession,
      fixture.fixture.transactionalEntityManager,
    );
    expect(fixture.fixture.eventEmitter.emitAsync).toHaveBeenCalledWith(
      ResourceSessionStartedEvent.EVENT_NAME,
      expect.any(Object),
    );
    expect(fixture.fixture.flowExecutorService.runFlow).toHaveBeenCalledWith(
      mockActiveSession.resourceId,
      ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
      expect.objectContaining({ endNotes: prefixedNotes }),
      undefined,
      { lifecycleAttemptId: expect.any(String) },
    );
  });
}
