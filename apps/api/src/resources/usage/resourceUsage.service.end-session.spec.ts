import {
  Resource,
  ResourceFlowNodeType,
  ResourceType,
  ResourceUsage,
  ResourceUsageAction,
  User,
} from '@attraccess/database-entities';

import { BadRequestException } from '@nestjs/common';

import { IsNull, SelectQueryBuilder } from 'typeorm';

import { inheritTestScope } from './../../test-utils/inherit-test-scope';

import { ExternalEffectFailureError } from './../flows/errors/external-effect-failure.error';

import { FlowExecutionError } from './../flows/errors/flow-execution.error';

import { EndUsageSessionDto } from './dtos/endUsageSession.dto';

import {
  ResourceSessionStartedEvent,
  ResourceSupervisedUsageEndedEvent,
  ResourceUsageNoteAddedEvent,
  ResourceUsageSessionEndedEvent,
} from './events/resource-usage.events';

import { resetTestFixture } from './resourceUsage.service.setup.test-fixture';

import { createEndSessionFixture } from './resourceUsage.service.spec.createEndSessionFixture.test-fixture';

import { createResourceUsageServiceFixture } from './resourceUsage.service.spec.createResourceUsageServiceFixture.test-fixture';

import { createStartSessionFixture } from './resourceUsage.service.spec.createStartSessionFixture.test-fixture';

import { createSupervisedStartFixture } from './resourceUsage.service.spec.createSupervisedStartFixture.test-fixture';

import { mockRbacService } from './resourceUsage.service.spec.mock-rbac-service';

export type ResourceUsageServiceTestScope = ReturnType<typeof createResourceUsageServiceFixture>;

export type EndSessionTestScope = ReturnType<typeof createEndSessionFixture>;

export type StartSessionTestScope = ReturnType<typeof createStartSessionFixture>;

export type SupervisedStartTestScope = ReturnType<typeof createSupervisedStartFixture>;

describe('ResourceUsageService', () => {
  // Expose transactional entity manager for assertions
  const scope = createResourceUsageServiceFixture();

  beforeEach(async () => {
    await resetTestFixture(scope);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockRbacService.getEffectivePermissions.mockResolvedValue(new Set<string>());
  });

  describe('getActiveSession', () => {
    const getActiveSessionScope = inheritTestScope(
      {
        get resourceUsageRepository() {
          return scope.resourceUsageRepository;
        },
        set resourceUsageRepository(value: typeof scope.resourceUsageRepository) {
          scope.resourceUsageRepository = value;
        },
        get service() {
          return scope.service;
        },
        set service(value: typeof scope.service) {
          scope.service = value;
        },
      },
      scope,
    );

    it('should return active session when it exists', async () => {
      const mockActiveSession = { id: 1, resourceId: 1, userId: 1, user: { id: 1 } as User } as ResourceUsage;
      getActiveSessionScope.resourceUsageRepository.findOne.mockResolvedValue(mockActiveSession);

      const result = await getActiveSessionScope.service.getActiveSession(1);

      expect(result).toBe(mockActiveSession);
      expect(getActiveSessionScope.resourceUsageRepository.findOne).toHaveBeenCalledWith({
        where: {
          resourceId: 1,
          endTime: IsNull(),
          isFinalized: true,
          lifecyclePending: false,
          usageAction: ResourceUsageAction.Usage,
        },
        order: { startTime: 'DESC', id: 'DESC' },
        relations: ['user', 'resource', 'billingTransaction', 'project', 'supervisorUser'],
      });
    });

    it('should return null when no active session exists', async () => {
      getActiveSessionScope.resourceUsageRepository.findOne.mockResolvedValue(null);

      const result = await getActiveSessionScope.service.getActiveSession(1);

      expect(result).toBeNull();
    });
  });

  describe('endSession', () => {
    const endSessionScope = createEndSessionFixture(scope);

    it('should end session successfully', async () => {
      const dto: EndUsageSessionDto = { notes: 'Session completed' };
      const mockActiveSession = {
        id: 1,
        resourceId: 1,
        userId: 1,
        startTime: new Date(),
        user: { id: 1 } as User,
      } as ResourceUsage;
      const mockUpdatedSession = { ...mockActiveSession, endTime: new Date(), endNotes: 'Session completed' };

      // Mock getActiveSession to return an active session, emitUsageEvent fetch, then final fetch
      endSessionScope.resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession) // 1) getActiveSession
        .mockResolvedValueOnce(mockUpdatedSession) // 2) emitUsageEvent fetch
        .mockResolvedValueOnce(mockUpdatedSession); // 3) fetch updated session to return

      const mockUpdateQueryBuilder = endSessionScope.createMockQueryBuilder(null);
      // Ensure update(ResourceUsage) is called: our mock returns chainable builder
      (mockUpdateQueryBuilder.update as jest.Mock).mockReturnValue(mockUpdateQueryBuilder);
      endSessionScope.resourceUsageRepository.createQueryBuilder.mockReturnValue(
        mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      const result = await endSessionScope.service.endSession(1, endSessionScope.mockUser, dto);

      expect(result).toBe(mockUpdatedSession);
      expect(endSessionScope.resourceUsageRepository.manager.transaction).toHaveBeenCalled();
      expect(endSessionScope.eventEmitter.emitAsync).toHaveBeenCalledWith(
        ResourceSessionStartedEvent.EVENT_NAME,
        expect.any(Object),
      );

      const emitted = endSessionScope.eventEmitter.emitAsync.mock.calls.find(
        (c) => c[0] === ResourceSessionStartedEvent.EVENT_NAME,
      );
      const eventPayload = emitted?.[1] as ResourceSessionStartedEvent;
      expect(eventPayload).toBeInstanceOf(ResourceSessionStartedEvent);
      expect(eventPayload.usage).toMatchObject({ id: 1, userId: 1, endNotes: 'Session completed' });
      expect(endSessionScope.mockAuditService.recordResource).toHaveBeenCalledWith({
        action: 'usage_session.ended',
        actorId: 1,
        authenticationMethod: 'session',
        subjectId: 1,
        details: { usageId: 1, usageUserId: 1 },
      });
    });

    it('runs the stopped-session flow after reservation but before usage finalization', async () => {
      const mockActiveSession = {
        id: 1,
        resourceId: 1,
        userId: 1,
        startTime: new Date(),
        user: { id: 1 } as User,
      } as ResourceUsage;
      const mockUpdatedSession = { ...mockActiveSession, endTime: new Date(), endNotes: 'Auto-ended' };
      const calls: string[] = [];
      let usageTransactionCommitted = false;

      endSessionScope.resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession)
        .mockResolvedValueOnce(mockUpdatedSession)
        .mockResolvedValueOnce(mockUpdatedSession);

      const mockUpdateQueryBuilder = endSessionScope.createMockQueryBuilder(null);
      (endSessionScope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );
      endSessionScope.transactionalEntityManager.update.mockImplementation(async (entity, _id, values) => {
        if (entity === ResourceUsage && values.endTime) calls.push('update');
        return { affected: 1 };
      });
      endSessionScope.flowExecutorService.runFlow.mockImplementation(async () => {
        expect(usageTransactionCommitted).toBe(true);
        calls.push('flow');
        return [];
      });
      (endSessionScope.resourceUsageRepository.manager.transaction as jest.Mock).mockImplementationOnce(
        async (callback) => {
          const result = await callback(endSessionScope.transactionalEntityManager);
          usageTransactionCommitted = true;
          return result;
        },
      );

      await endSessionScope.service.endSession(1, mockActiveSession.user, { notes: 'Auto-ended' });

      expect(calls).toEqual(['flow', 'update']);
      expect(endSessionScope.flowExecutorService.runFlow).toHaveBeenCalledWith(
        1,
        ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
        expect.objectContaining({ endNotes: 'Auto-ended' }),
        undefined,
        { lifecycleAttemptId: expect.any(String) },
      );
    });

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

      endSessionScope.resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession)
        .mockResolvedValueOnce(mockUpdatedSession);
      endSessionScope.flowExecutorService.runFlow.mockRejectedValueOnce(error);
      const mockUpdateQueryBuilder = endSessionScope.createMockQueryBuilder(null);
      let sessionEnded = false;
      (endSessionScope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );
      (mockUpdateQueryBuilder.execute as jest.Mock).mockImplementation(async () => {
        sessionEnded = true;
      });
      (endSessionScope.resourceUsageRepository.manager.transaction as jest.Mock).mockImplementationOnce(
        async (callback) => {
          const result = await callback(endSessionScope.transactionalEntityManager);
          usageTransactionCommitted = true;
          return result;
        },
      );

      await expect(endSessionScope.service.endSession(1, mockActiveSession.user, { notes: 'Auto-ended' })).rejects.toBe(
        error,
      );

      expect(endSessionScope.eventEmitter.emitAsync).not.toHaveBeenCalled();
      expect(endSessionScope.eventEmitter.emit).not.toHaveBeenCalledWith(
        ResourceUsageSessionEndedEvent.EVENT_NAME,
        expect.any(Object),
      );
      expect(endSessionScope.mockMetricsService.resourceUsageSessionsTotal.inc).not.toHaveBeenCalled();
      expect(usageTransactionCommitted).toBe(true);
      expect(sessionEnded).toBe(false);
      expect(endSessionScope.transactionalEntityManager.update).not.toHaveBeenCalled();
      expect(endSessionScope.billingService.chargeForResourceUsage).not.toHaveBeenCalled();
      expect(endSessionScope.mockAuditService.recordResource).not.toHaveBeenCalled();
      expect(endSessionScope.lifecycleAttempts.size).toBe(0);
      expect(endSessionScope.flowExecutorService.runFlow).toHaveBeenCalledWith(
        1,
        ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
        expect.any(Object),
        undefined,
        { lifecycleAttemptId: expect.any(String) },
      );
    });

    it('returns the no-activity-ended session with its configured end notes in usage history immediately', async () => {
      const configuredEndNotes = 'Ended automatically after 5 minutes of inactivity';
      const usage = {
        id: 42,
        resourceId: 1,
        userId: 1,
        startTime: new Date(),
        endTime: null,
        endNotes: null,
        user: { id: 1, username: 'member' } as User,
        resource: { id: 1, type: ResourceType.Machine } as Resource,
      } as ResourceUsage;
      const updateQueryBuilder = endSessionScope.createMockQueryBuilder(null);

      endSessionScope.resourceUsageRepository.findOne.mockImplementation(async ({ where }) => {
        if (where?.id === usage.id || (where?.resourceId === usage.resourceId && usage.endTime === null)) {
          return usage;
        }
        return null;
      });
      endSessionScope.resourceUsageRepository.findAndCount = jest.fn().mockResolvedValue([[usage], 1]);
      (endSessionScope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(updateQueryBuilder);
      endSessionScope.transactionalEntityManager.update.mockImplementation(async (entity, _id, values) => {
        if (entity === ResourceUsage) Object.assign(usage, values);
        return { affected: 1 };
      });

      // No-activity flows end a session with configured notes and skip interactive end forms.
      await endSessionScope.service.endSession(
        usage.resourceId,
        usage.user,
        { notes: configuredEndNotes },
        { skipFormSubmissions: true, skipNoteNotification: true },
      );
      const history = await endSessionScope.service.getResourceUsageHistory(usage.resourceId, 1, 10, usage.userId);

      expect(history.data).toEqual([expect.objectContaining({ id: usage.id, endNotes: configuredEndNotes })]);
    });

    it('rolls back ending the session when billing fails', async () => {
      const mockActiveSession = {
        id: 1,
        resourceId: 1,
        userId: 1,
        startTime: new Date(),
        user: { id: 1 } as User,
      } as ResourceUsage;
      const mockUpdatedSession = { ...mockActiveSession, endTime: new Date(), endNotes: 'Auto-ended' };
      const billingError = new Error('Billing failed');

      endSessionScope.resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession)
        .mockResolvedValueOnce(mockUpdatedSession);
      endSessionScope.billingService.chargeForResourceUsage.mockRejectedValueOnce(billingError);

      await expect(
        endSessionScope.service.endSession(1, mockActiveSession.user, { notes: 'Auto-ended' }),
      ).rejects.toThrow(billingError);

      expect(endSessionScope.billingService.chargeForResourceUsage).toHaveBeenCalledWith(
        mockUpdatedSession,
        endSessionScope.transactionalEntityManager,
      );
      expect(endSessionScope.flowExecutorService.runFlow).toHaveBeenCalledTimes(1);
      expect(endSessionScope.eventEmitter.emitAsync).not.toHaveBeenCalled();
    });

    it("emits a resource session ended notification event after ending someone else's session", async () => {
      const dto: EndUsageSessionDto = { notes: 'Manager stop' };
      const sessionOwner = { id: 77, username: 'member' } as User;
      const managerUser = {
        id: 88,
        username: 'manager',
      } as User;
      endSessionScope.mockRbacService.getEffectivePermissions.mockResolvedValue(new Set(['resources.update']));
      const mockActiveSession = {
        id: 5,
        resourceId: 12,
        userId: sessionOwner.id,
        startTime: new Date(),
        user: sessionOwner,
        resource: { id: 12, name: 'Laser cutter' } as Resource,
      } as ResourceUsage;
      const mockUpdatedSession = {
        ...mockActiveSession,
        endTime: new Date(),
        endNotes: `[By #${managerUser.id} - ${managerUser.username}] ${dto.notes}`,
      };

      endSessionScope.resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession)
        .mockResolvedValueOnce(mockUpdatedSession)
        .mockResolvedValueOnce(mockUpdatedSession);

      const mockUpdateQueryBuilder = endSessionScope.createMockQueryBuilder(null);
      (endSessionScope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      await endSessionScope.service.endSession(mockActiveSession.resourceId, managerUser, dto);

      const endedEmit = endSessionScope.eventEmitter.emit.mock.calls.find(
        (c) => c[0] === ResourceUsageSessionEndedEvent.EVENT_NAME,
      );
      expect(endedEmit).toBeDefined();
      const payload = endedEmit?.[1] as ResourceUsageSessionEndedEvent;
      expect(payload).toBeInstanceOf(ResourceUsageSessionEndedEvent);
      expect(payload.usage).toBe(mockUpdatedSession);
      expect(payload.endedBy).toEqual({ id: managerUser.id, username: managerUser.username });
    });

    it('emits a system resource session ended notification event for flow-ended sessions', async () => {
      const owner = { id: 77, username: 'member' } as User;
      const mockActiveSession = {
        id: 5,
        resourceId: 12,
        userId: owner.id,
        startTime: new Date(),
        user: owner,
        resource: { id: 12, name: 'Laser cutter' } as Resource,
      } as ResourceUsage;
      const mockUpdatedSession = {
        ...mockActiveSession,
        endTime: new Date(),
        endNotes: 'Flow stop',
      };

      endSessionScope.resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession)
        .mockResolvedValueOnce(mockUpdatedSession)
        .mockResolvedValueOnce(mockUpdatedSession);

      const mockUpdateQueryBuilder = endSessionScope.createMockQueryBuilder(null);
      (endSessionScope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      await endSessionScope.service.endSession(
        mockActiveSession.resourceId,
        owner,
        { notes: 'Flow stop' },
        { skipFormSubmissions: true, skipNoteNotification: true },
      );

      const endedEmit = endSessionScope.eventEmitter.emit.mock.calls.find(
        (c) => c[0] === ResourceUsageSessionEndedEvent.EVENT_NAME,
      );
      expect(endedEmit).toBeDefined();
      const payload = endedEmit?.[1] as ResourceUsageSessionEndedEvent;
      expect(payload.usage).toBe(mockUpdatedSession);
      expect(payload.endedBy).toBeNull();
    });

    it('emits ResourceUsageNoteAddedEvent when a user note is present', async () => {
      endSessionScope.setupEndSession();

      await endSessionScope.service.endSession(1, endSessionScope.mockUser, { notes: 'note text' });

      const noteEmit = endSessionScope.eventEmitter.emit.mock.calls.find(
        (c) => c[0] === ResourceUsageNoteAddedEvent.EVENT_NAME,
      );
      expect(noteEmit).toBeDefined();
      const payload = noteEmit?.[1] as ResourceUsageNoteAddedEvent;
      expect(payload).toMatchObject({ resourceId: 1, note: 'note text', phase: 'end' });
    });

    it('does not emit the note event when skipNoteNotification is set (flow-ended session)', async () => {
      endSessionScope.setupEndSession();

      await endSessionScope.service.endSession(
        1,
        endSessionScope.mockUser,
        { notes: 'auto note' },
        { skipNoteNotification: true },
      );

      const noteEmit = endSessionScope.eventEmitter.emit.mock.calls.find(
        (c) => c[0] === ResourceUsageNoteAddedEvent.EVENT_NAME,
      );
      expect(noteEmit).toBeUndefined();
    });

    it('should throw error when no active session exists', async () => {
      const dto: EndUsageSessionDto = { notes: 'Session completed' };

      // Mock getActiveSession to return null (no active session)
      endSessionScope.resourceUsageRepository.findOne.mockResolvedValue(null);

      await expect(endSessionScope.service.endSession(1, endSessionScope.mockUser, dto)).rejects.toThrow(
        new BadRequestException('No active session found'),
      );
    });

    it('looks up the active session inside the stop transaction', async () => {
      const dto: EndUsageSessionDto = { notes: 'Session completed' };
      const sessionOwner = { id: 1, username: 'owner' } as User;
      const mockActiveSession = {
        id: 5,
        resourceId: 12,
        userId: sessionOwner.id,
        startTime: new Date(),
        user: sessionOwner,
        resource: { id: 12, name: 'Laser cutter' } as Resource,
      } as ResourceUsage;
      const mockUpdatedSession = { ...mockActiveSession, endTime: new Date(), endNotes: 'Session completed' };
      let transactionStarted = false;

      (endSessionScope.resourceUsageRepository.manager.transaction as jest.Mock).mockImplementationOnce(async (cb) => {
        transactionStarted = true;
        return cb(endSessionScope.transactionalEntityManager);
      });
      endSessionScope.resourceUsageRepository.findOne.mockImplementation(async () => {
        expect(transactionStarted).toBe(true);
        return endSessionScope.resourceUsageRepository.findOne.mock.calls.length === 1
          ? mockActiveSession
          : mockUpdatedSession;
      });

      await endSessionScope.service.endSession(mockActiveSession.resourceId, sessionOwner, dto);

      expect(endSessionScope.flowExecutorService.runFlow).toHaveBeenCalledTimes(1);
      expect(endSessionScope.billingService.chargeForResourceUsage).toHaveBeenCalledTimes(1);
    });

    it('allows users with resources.update permission to end sessions owned by others', async () => {
      const dto: EndUsageSessionDto = { notes: 'Manual stop' };
      const sessionOwner = { id: 77, username: 'member' } as User;
      const managerUser = {
        id: 88,
        username: 'manager',
      } as User;
      endSessionScope.mockRbacService.getEffectivePermissions.mockResolvedValue(new Set(['resources.update']));
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

      endSessionScope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      endSessionScope.resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession)
        .mockResolvedValueOnce(mockUpdatedSession)
        .mockResolvedValueOnce(mockUpdatedSession);

      const mockUpdateQueryBuilder = endSessionScope.createMockQueryBuilder(null);
      (endSessionScope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      const result = await endSessionScope.service.endSession(mockActiveSession.resourceId, managerUser, dto);

      expect(result).toBe(mockUpdatedSession);
      expect(endSessionScope.resourceIntroducersService.canMaintain).not.toHaveBeenCalled();
      expect(endSessionScope.transactionalEntityManager.update).toHaveBeenCalled();
      expect(endSessionScope.billingService.chargeForResourceUsage).toHaveBeenCalledWith(
        mockUpdatedSession,
        endSessionScope.transactionalEntityManager,
      );
      expect(endSessionScope.eventEmitter.emitAsync).toHaveBeenCalledWith(
        ResourceSessionStartedEvent.EVENT_NAME,
        expect.any(Object),
      );
      expect(endSessionScope.flowExecutorService.runFlow).toHaveBeenCalledWith(
        mockActiveSession.resourceId,
        ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
        expect.objectContaining({ endNotes: prefixedNotes }),
        undefined,
        { lifecycleAttemptId: expect.any(String) },
      );
    });

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

      endSessionScope.resourceIntroducersService.canMaintain.mockResolvedValue(true);
      endSessionScope.resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession)
        .mockResolvedValueOnce(mockUpdatedSession)
        .mockResolvedValueOnce(mockUpdatedSession);

      const mockUpdateQueryBuilder = endSessionScope.createMockQueryBuilder(null);
      (endSessionScope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      const result = await endSessionScope.service.endSession(mockActiveSession.resourceId, introducerUser, dto);

      expect(result).toBe(mockUpdatedSession);
      expect(endSessionScope.resourceIntroducersService.canMaintain).toHaveBeenCalledWith(
        mockActiveSession.resourceId,
        introducerUser.id,
        true,
      );
      expect(endSessionScope.flowExecutorService.runFlow).toHaveBeenCalledWith(
        mockActiveSession.resourceId,
        ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
        expect.objectContaining({ endNotes: prefixedNotes }),
        undefined,
        { lifecycleAttemptId: expect.any(String) },
      );
    });

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

      endSessionScope.resourceIntroducersService.canMaintain.mockImplementation(
        async (_resId, _userId, includeGroupIntroducers) => (includeGroupIntroducers ? true : false),
      );
      endSessionScope.resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession)
        .mockResolvedValueOnce(mockUpdatedSession)
        .mockResolvedValueOnce(mockUpdatedSession);

      const mockUpdateQueryBuilder = endSessionScope.createMockQueryBuilder(null);
      (endSessionScope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      const result = await endSessionScope.service.endSession(mockActiveSession.resourceId, groupIntroducer, dto);

      expect(result).toBe(mockUpdatedSession);
      expect(endSessionScope.resourceIntroducersService.canMaintain).toHaveBeenCalledWith(
        mockActiveSession.resourceId,
        groupIntroducer.id,
        true,
      );
      await expect(endSessionScope.resourceIntroducersService.canMaintain.mock.results.at(-1)?.value).resolves.toBe(
        true,
      );
      expect(endSessionScope.flowExecutorService.runFlow).toHaveBeenCalledWith(
        mockActiveSession.resourceId,
        ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
        expect.objectContaining({ endNotes: prefixedNotes }),
        undefined,
        { lifecycleAttemptId: expect.any(String) },
      );
    });

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

      endSessionScope.resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession)
        .mockResolvedValueOnce(mockUpdatedSession)
        .mockResolvedValueOnce(mockUpdatedSession);

      const mockUpdateQueryBuilder = endSessionScope.createMockQueryBuilder(null);
      (endSessionScope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      const result = await endSessionScope.service.endSession(mockActiveSession.resourceId, supervisorUser, dto);

      expect(result).toBe(mockUpdatedSession);
      // The supervisor short-circuits the authorization check; no introducer lookup needed.
      expect(endSessionScope.resourceIntroducersService.canMaintain).not.toHaveBeenCalled();
      expect(endSessionScope.flowExecutorService.runFlow).toHaveBeenCalledWith(
        mockActiveSession.resourceId,
        ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
        expect.objectContaining({ endNotes: prefixedNotes }),
        undefined,
        { lifecycleAttemptId: expect.any(String) },
      );
    });

    it('emits the auto-promotion counter event when a supervised session ends', async () => {
      const dto: EndUsageSessionDto = {};
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
      const mockUpdatedSession = { ...mockActiveSession, endTime: new Date() };

      endSessionScope.resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession)
        .mockResolvedValueOnce(mockUpdatedSession)
        .mockResolvedValueOnce(mockUpdatedSession);

      (endSessionScope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        endSessionScope.createMockQueryBuilder(null) as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      await endSessionScope.service.endSession(mockActiveSession.resourceId, supervisorUser, dto);

      const endedEmit = endSessionScope.eventEmitter.emit.mock.calls.find(
        (c) => c[0] === ResourceSupervisedUsageEndedEvent.EVENT_NAME,
      );
      expect(endedEmit).toBeDefined();
      const payload = endedEmit?.[1] as ResourceSupervisedUsageEndedEvent;
      expect(payload).toBeInstanceOf(ResourceSupervisedUsageEndedEvent);
      expect(payload).toMatchObject({ resourceId: 40, userId: 60, supervisorUserId: 61, usageId: 9 });
    });

    it('does not emit the auto-promotion counter event for an unsupervised session end', async () => {
      const dto: EndUsageSessionDto = {};
      const sessionOwner = { id: 60, username: 'student' } as User;
      const mockActiveSession = {
        id: 9,
        resourceId: 40,
        userId: sessionOwner.id,
        supervisorUserId: null,
        startTime: new Date(),
        user: sessionOwner,
      } as ResourceUsage;
      const mockUpdatedSession = { ...mockActiveSession, endTime: new Date() };

      endSessionScope.resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession)
        .mockResolvedValueOnce(mockUpdatedSession)
        .mockResolvedValueOnce(mockUpdatedSession);

      (endSessionScope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        endSessionScope.createMockQueryBuilder(null) as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      await endSessionScope.service.endSession(mockActiveSession.resourceId, sessionOwner, dto);

      const endedEmit = endSessionScope.eventEmitter.emit.mock.calls.find(
        (c) => c[0] === ResourceSupervisedUsageEndedEvent.EVENT_NAME,
      );
      expect(endedEmit).toBeUndefined();
    });
  });
});
