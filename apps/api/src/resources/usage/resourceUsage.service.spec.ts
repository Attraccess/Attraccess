import {
  Project,
  Resource,
  ResourceFlowNodeType,
  ResourceType,
  ResourceUsage,
  ResourceUsageAction,
  SupervisionMode,
  User,
} from '@attraccess/database-entities';

import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { SelectQueryBuilder } from 'typeorm';

import { InsufficientBalanceError } from './../../billing/errors/insufficient-balance.error';

import { ResourceUsageImpossibleMaintenanceInProgressException } from './../../exceptions/resource.maintenance.inUse.exception';

import { ResourceNotFoundException } from './../../exceptions/resource.notFound.exception';

import { inheritTestScope } from './../../test-utils/inherit-test-scope';

import { ExternalEffectFailureError } from './../flows/errors/external-effect-failure.error';

import { StartUsageSessionDto } from './dtos/startUsageSession.dto';

import { ResourceInUseError } from './errors/resource-in-use.error';

import {
  ResourceSessionStartedEvent,
  ResourceSupervisedUsageStartedEvent,
  ResourceUsageSessionTakenOverEvent,
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

  it('assigns and clears a completed session project through the owning user', async () => {
    const usage = {
      id: 8,
      resourceId: 1,
      userId: 7,
      endTime: new Date(),
      usageAction: ResourceUsageAction.Usage,
    } as ResourceUsage;
    scope.resourceUsageRepository.findOne.mockResolvedValue(usage);
    const user = { id: 7 } as User;
    expect(await scope.service.updateSessionProject(1, 8, user, { projectId: 9 })).toBe(usage);
    expect(scope.projectsService.findOneById).toHaveBeenCalledWith(7, 9);
    expect(scope.resourceUsageRepository.save).toHaveBeenCalledWith(expect.objectContaining({ projectId: 9 }));
    await scope.service.updateSessionProject(1, 8, user, { projectId: null });
    expect(scope.resourceUsageRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ projectId: null, project: null }),
    );
  });

  it('rejects invalid or unauthorized project assignments without writing the session', async () => {
    const user = { id: 7 } as User;
    scope.resourceUsageRepository.findOne.mockResolvedValue(null);
    await expect(scope.service.updateSessionProject(1, 8, user, { projectId: 9 })).rejects.toThrow('not found');
    const usage = {
      id: 8,
      resourceId: 1,
      userId: 7,
      endTime: null,
      usageAction: ResourceUsageAction.Usage,
    } as ResourceUsage;
    scope.resourceUsageRepository.findOne.mockResolvedValue(usage);
    await expect(scope.service.updateSessionProject(1, 8, user, { projectId: 9 })).rejects.toThrow('still active');
    usage.endTime = new Date();
    usage.usageAction = ResourceUsageAction.DoorUnlock;
    await expect(scope.service.updateSessionProject(1, 8, user, { projectId: 9 })).rejects.toThrow(
      'Only usage sessions',
    );
    usage.usageAction = ResourceUsageAction.Usage;
    usage.userId = 99;
    await expect(scope.service.updateSessionProject(1, 8, user, { projectId: 9 })).rejects.toThrow('not authorized');
    usage.userId = 7;
    await expect(scope.service.updateSessionProject(1, 8, user, {} as never)).rejects.toThrow('required');
    expect(scope.resourceUsageRepository.save).not.toHaveBeenCalled();
  });

  describe('getSessionDetails', () => {
    const requester = { id: 1, effectivePermissions: new Set<string>() } as AuthenticatedUser;
    const getSessionDetailsScope = inheritTestScope(
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
        get requester() {
          return requester;
        },
        get projectsService() {
          return scope.projectsService;
        },
        set projectsService(value: typeof scope.projectsService) {
          scope.projectsService = value;
        },
      },
      scope,
    );

    it('loads the requested visible session and its usage details for the owner', async () => {
      const usage = { id: 8, userId: 1, resourceId: 5 } as ResourceUsage;
      getSessionDetailsScope.resourceUsageRepository.findOne.mockResolvedValue(usage);
      expect(await getSessionDetailsScope.service.getSessionDetails(5, 8, getSessionDetailsScope.requester)).toBe(
        usage,
      );
      expect(getSessionDetailsScope.resourceUsageRepository.findOne).toHaveBeenCalledWith({
        where: { id: 8, resourceId: 5, lifecyclePending: false },
        relations: expect.arrayContaining(['project', 'supervisorUser', 'formSubmissions.form']),
      });
      expect(getSessionDetailsScope.projectsService.findOneById).not.toHaveBeenCalled();
    });

    it('allows resource managers to view another user’s session', async () => {
      getSessionDetailsScope.resourceUsageRepository.findOne.mockResolvedValue({ id: 8, userId: 2 } as ResourceUsage);
      expect(
        await getSessionDetailsScope.service.getSessionDetails(5, 8, {
          ...getSessionDetailsScope.requester,
          effectivePermissions: new Set(['resources.update']),
        }),
      ).toEqual({ id: 8, userId: 2 });
      expect(getSessionDetailsScope.projectsService.findOneById).not.toHaveBeenCalled();
    });

    it('requires project access before returning another member’s usage', async () => {
      const usage = { id: 8, userId: 2, projectId: 3 } as ResourceUsage;
      getSessionDetailsScope.resourceUsageRepository.findOne.mockResolvedValue(usage);
      getSessionDetailsScope.projectsService.findOneById.mockResolvedValue({ id: 3 } as Project);
      expect(await getSessionDetailsScope.service.getSessionDetails(5, 8, getSessionDetailsScope.requester)).toBe(
        usage,
      );
      expect(getSessionDetailsScope.projectsService.findOneById).toHaveBeenCalledWith(1, 3);
      getSessionDetailsScope.projectsService.findOneById.mockRejectedValue(new NotFoundException('Project not found'));
      await expect(
        getSessionDetailsScope.service.getSessionDetails(5, 8, getSessionDetailsScope.requester),
      ).rejects.toThrow(NotFoundException);
    });

    it.each([null, { id: 8, userId: 2, projectId: null }])(
      'rejects missing or inaccessible sessions (%s)',
      async (usage) => {
        getSessionDetailsScope.resourceUsageRepository.findOne.mockResolvedValue(usage as ResourceUsage);
        await expect(
          getSessionDetailsScope.service.getSessionDetails(5, 8, getSessionDetailsScope.requester),
        ).rejects.toThrow(NotFoundException);
      },
    );
  });

  describe('startSession', () => {
    const startSessionScope = createStartSessionFixture(scope);

    it('should roll back the start when an HTTP transport failure is propagated', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session' };
      let transactionCommitted = false;

      startSessionScope.flowExecutorService.runFlow.mockRejectedValueOnce(
        new ExternalEffectFailureError('HTTP dispatch failed', new Error('HTTP dispatch failed'), 'transport-dispatch'),
      );

      // Mock resourceRepository.findOne to return the resource
      startSessionScope.resourceRepository.findOne.mockResolvedValue(startSessionScope.mockResource);
      startSessionScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      startSessionScope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      startSessionScope.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      startSessionScope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      startSessionScope.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
      startSessionScope.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

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
      startSessionScope.resourceUsageRepository.findOne
        .mockResolvedValueOnce(null) // 1) getActiveSession
        .mockResolvedValueOnce(createdSession) // 2) fetch newly created session
        .mockResolvedValueOnce(finalizedSession) // 3) fetch finalized session for return
        .mockResolvedValueOnce(finalizedSession); // 4) emitUsageEvent fetch by id

      const mockQueryBuilder = startSessionScope.createMockQueryBuilder(null);
      // Service uses transactionalEntityManager.createQueryBuilder, not repo
      (startSessionScope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );
      (startSessionScope.resourceUsageRepository.manager.transaction as jest.Mock).mockImplementationOnce(
        async (callback) => {
          const result = await callback(startSessionScope.transactionalEntityManager);
          transactionCommitted = true;
          return result;
        },
      );

      await expect(startSessionScope.service.startSession(1, startSessionScope.mockUser, dto)).rejects.toThrow(
        'HTTP dispatch failed',
      );
      expect(transactionCommitted).toBe(true);
      expect(startSessionScope.lifecycleAttempts.size).toBe(0);
      expect(startSessionScope.transactionalEntityManager.delete).toHaveBeenCalledWith(
        ResourceUsage,
        expect.objectContaining({ lifecyclePending: true }),
      );
      expect(startSessionScope.transactionalEntityManager.createQueryBuilder).toHaveBeenCalled();
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
      expect(startSessionScope.eventEmitter.emitAsync).not.toHaveBeenCalled();
      expect(startSessionScope.flowExecutorService.trackResourceActivity).not.toHaveBeenCalled();
      expect(startSessionScope.flowExecutorService.runFlow).toHaveBeenCalledWith(
        createdSession.resourceId,
        ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
        expect.any(Object),
        undefined,
        { lifecycleAttemptId: expect.any(String) },
      );
    });

    it('should throw error when resource does not exist', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session' };

      // Mock resourceRepository.findOne to return null (resource not found)
      startSessionScope.resourceRepository.findOne.mockResolvedValue(null);

      await expect(startSessionScope.service.startSession(1, startSessionScope.mockUser, dto)).rejects.toThrow(
        ResourceNotFoundException,
      );
    });

    it('should throw error when user has not completed introduction', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session' };

      // Mock resourceRepository.findOne to return the resource
      startSessionScope.resourceRepository.findOne.mockResolvedValue(startSessionScope.mockResource);
      startSessionScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      startSessionScope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(false);
      startSessionScope.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      startSessionScope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      startSessionScope.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
      startSessionScope.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

      await expect(startSessionScope.service.startSession(1, startSessionScope.mockUser, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(startSessionScope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledWith(
        1,
        1,
        expect.anything(),
      );
    });

    it('should throw error when active session exists and no takeover requested', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session' };

      // Mock resourceRepository.findOne to return the resource
      startSessionScope.resourceRepository.findOne.mockResolvedValue(startSessionScope.mockResource);
      startSessionScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      startSessionScope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      startSessionScope.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      startSessionScope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      startSessionScope.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
      startSessionScope.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

      const mockActiveSession = { id: 1, userId: 2, user: { id: 2 } as User } as ResourceUsage;
      // Mock getActiveSession to return an active session
      startSessionScope.resourceUsageRepository.findOne.mockResolvedValue(mockActiveSession);

      await expect(startSessionScope.service.startSession(1, startSessionScope.mockUser, dto)).rejects.toBeInstanceOf(
        ResourceInUseError,
      );
    });

    it('should throw error when takeover requested but resource does not allow it', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session', forceTakeOver: true };

      // Mock resourceRepository.findOne to return the resource (allowTakeOver: false)
      startSessionScope.resourceRepository.findOne.mockResolvedValue(startSessionScope.mockResource);
      startSessionScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      startSessionScope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      startSessionScope.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      startSessionScope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      startSessionScope.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
      startSessionScope.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

      const mockActiveSession = { id: 1, userId: 2, user: { id: 2 } as User } as ResourceUsage;
      // Mock getActiveSession to return an active session
      startSessionScope.resourceUsageRepository.findOne.mockResolvedValue(mockActiveSession);

      await expect(startSessionScope.service.startSession(1, startSessionScope.mockUser, dto)).rejects.toThrow(
        new BadRequestException('This resource does not allow overtaking'),
      );
    });

    it('should roll back the takeover when an MQTT controller rejection is propagated', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session', forceTakeOver: true };
      let transactionCommitted = false;

      startSessionScope.flowExecutorService.runFlow.mockRejectedValueOnce(
        new ExternalEffectFailureError(
          'MQTT controller rejected takeover',
          new Error('MQTT controller rejected takeover'),
          'controller-rejection',
        ),
      );

      // Mock resourceRepository.findOne to return the resource (allowTakeOver: true)
      startSessionScope.resourceRepository.findOne.mockResolvedValue(startSessionScope.mockResourceWithTakeOver);
      startSessionScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      startSessionScope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      startSessionScope.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      startSessionScope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      startSessionScope.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
      startSessionScope.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

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
      startSessionScope.resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession) // 1) getActiveSession
        .mockResolvedValueOnce(mockNewUsage) // candidate in prepare
        .mockResolvedValueOnce(updatedEndedSession) // previous session at finish
        .mockResolvedValueOnce(finalizedNewUsage) // 4) fetch finalized new session (in-transaction)
        .mockResolvedValueOnce(updatedEndedSession) // 5) emitUsageEvent fetch for ended session (after commit)
        .mockResolvedValueOnce(finalizedNewUsage) // 6) emitUsageEvent fetch for newly created session (after commit)
        .mockResolvedValueOnce(finalizedNewUsage); // 7) safeguard for any additional fetches

      const mockUpdateQueryBuilder = startSessionScope.createMockQueryBuilder(null);
      const mockInsertQueryBuilder = startSessionScope.createMockQueryBuilder(null);

      // Service uses transactionalEntityManager.createQueryBuilder
      (startSessionScope.transactionalEntityManager.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>) // For ending session
        .mockReturnValueOnce(mockInsertQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>); // For creating new session
      (startSessionScope.resourceUsageRepository.manager.transaction as jest.Mock).mockImplementationOnce(
        async (callback) => {
          const result = await callback(startSessionScope.transactionalEntityManager);
          transactionCommitted = true;
          return result;
        },
      );

      await expect(startSessionScope.service.startSession(1, startSessionScope.mockUser, dto)).rejects.toThrow(
        'MQTT controller rejected takeover',
      );
      expect(transactionCommitted).toBe(true);
      expect(startSessionScope.lifecycleAttempts.size).toBe(0);
      expect(startSessionScope.transactionalEntityManager.delete).toHaveBeenCalledWith(
        ResourceUsage,
        expect.objectContaining({ lifecyclePending: true }),
      );
      expect(startSessionScope.billingService.chargeForResourceUsage).not.toHaveBeenCalled();
      expect(startSessionScope.billingService.handleResourceUsageStart).not.toHaveBeenCalled();
      expect(startSessionScope.eventEmitter.emitAsync).not.toHaveBeenCalled();
      expect(startSessionScope.eventEmitter.emit).not.toHaveBeenCalledWith(
        ResourceUsageSessionTakenOverEvent.EVENT_NAME,
        expect.any(Object),
      );
      expect(startSessionScope.flowExecutorService.trackResourceActivity).not.toHaveBeenCalled();
      expect(startSessionScope.flowExecutorService.runFlow).toHaveBeenCalledWith(
        mockActiveSession.resourceId,
        ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER,
        expect.any(Object),
        undefined,
        { lifecycleAttemptId: expect.any(String) },
      );
    });

    it('should trigger only TAKEOVER flow on takeover and not STARTED/STOPPED; billing unchanged', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session', forceTakeOver: true };

      startSessionScope.resourceRepository.findOne.mockResolvedValue(startSessionScope.mockResourceWithTakeOver);
      startSessionScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      startSessionScope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      startSessionScope.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      startSessionScope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      startSessionScope.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
      startSessionScope.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

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

      startSessionScope.resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession) // getActiveSession
        .mockResolvedValueOnce(mockNewUsage) // candidate in prepare
        .mockResolvedValueOnce(updatedEndedSession) // previous session at finish
        .mockResolvedValueOnce(mockNewUsage) // finalized candidate
        .mockResolvedValueOnce(updatedEndedSession) // emitUsageEvent for ended
        .mockResolvedValueOnce(mockNewUsage); // emitUsageEvent for started

      const mockUpdateQueryBuilder = startSessionScope.createMockQueryBuilder(null);
      const mockInsertQueryBuilder = startSessionScope.createMockQueryBuilder(null);

      (startSessionScope.transactionalEntityManager.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>)
        .mockReturnValueOnce(mockInsertQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>);

      await startSessionScope.service.startSession(1, startSessionScope.mockUser, dto);

      // Only one flow call and it must be TAKEOVER
      expect(startSessionScope.flowExecutorService.runFlow).toHaveBeenCalledTimes(1);
      const [resId, nodeType, payload] = startSessionScope.flowExecutorService.runFlow.mock.calls[0];
      expect(resId).toBe(mockActiveSession.resourceId ?? 1);
      expect(nodeType).toBe(ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER);
      expect(payload).toMatchObject({
        newUser: { id: startSessionScope.mockUser.id },
        oldUser: { id: mockActiveSession.user.id },
      });

      // Billing start should still be called exactly once for the new session
      expect(startSessionScope.billingService.handleResourceUsageStart).toHaveBeenCalledTimes(1);
      // Billing charge should occur for previous ended session exactly once
      expect(startSessionScope.billingService.chargeForResourceUsage).toHaveBeenCalledTimes(1);
      const chargedArg = (startSessionScope.billingService.chargeForResourceUsage as unknown as jest.Mock).mock
        .calls[0][0] as ResourceUsage;
      expect(chargedArg.user?.id).toBe(mockActiveSession.user.id);
      const chargedIds = (
        startSessionScope.billingService.chargeForResourceUsage as unknown as jest.Mock
      ).mock.calls.map((c) => c[0]?.id);
      expect(chargedIds).not.toContain(mockNewUsage.id);
      expect(startSessionScope.flowExecutorService.trackResourceActivity).toHaveBeenCalledTimes(1);
      expect(startSessionScope.flowExecutorService.trackResourceActivity).toHaveBeenCalledWith(mockNewUsage.resourceId);
    });

    it('should throw ResourceMaintenanceInUseException when resource is under maintenance and user cannot manage maintenance', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session' };

      // Mock resourceRepository.findOne to return the resource
      startSessionScope.resourceRepository.findOne.mockResolvedValue(startSessionScope.mockResource);

      // Mock maintenance service to indicate active maintenance
      startSessionScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(true);
      startSessionScope.resourceMaintenanceService.canManageMaintenance.mockResolvedValue(false);

      await expect(startSessionScope.service.startSession(1, startSessionScope.mockUser, dto)).rejects.toThrow(
        ResourceUsageImpossibleMaintenanceInProgressException,
      );
      expect(startSessionScope.resourceMaintenanceService.hasActiveMaintenance).toHaveBeenCalledWith(
        1,
        expect.anything(),
      );
      expect(startSessionScope.resourceMaintenanceService.canManageMaintenance).toHaveBeenCalledWith(
        startSessionScope.mockUser,
        1,
        expect.anything(),
      );
    });

    it('should block non-maintenance users when active maintenance exists including schedule-triggered (same as manual)', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session' };

      startSessionScope.resourceRepository.findOne.mockResolvedValue(startSessionScope.mockResource);
      // hasActiveMaintenance does not filter by origin: schedule-created maintenances use the same
      // table and criteria (startTime <= now, endTime IS NULL), so they block the same as manual ones
      startSessionScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(true);
      startSessionScope.resourceMaintenanceService.canManageMaintenance.mockResolvedValue(false);

      await expect(startSessionScope.service.startSession(1, startSessionScope.mockUser, dto)).rejects.toThrow(
        ResourceUsageImpossibleMaintenanceInProgressException,
      );
      expect(startSessionScope.resourceMaintenanceService.hasActiveMaintenance).toHaveBeenCalledWith(
        1,
        expect.anything(),
      );
      expect(startSessionScope.resourceMaintenanceService.canManageMaintenance).toHaveBeenCalledWith(
        startSessionScope.mockUser,
        1,
        expect.anything(),
      );
    });

    it('should throw ResourceUnhealthyException when resource is unhealthy and user cannot manage maintenance', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session' };

      startSessionScope.resourceRepository.findOne.mockResolvedValue(startSessionScope.mockResource);
      startSessionScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      startSessionScope.mockResourceHealthService.isResourceUnhealthy.mockResolvedValueOnce(true);
      startSessionScope.resourceMaintenanceService.canManageMaintenance.mockResolvedValue(false);

      const { ResourceUnhealthyException } = require('../../exceptions/resource.unhealthy.exception');

      await expect(startSessionScope.service.startSession(1, startSessionScope.mockUser, dto)).rejects.toBeInstanceOf(
        ResourceUnhealthyException,
      );
      expect(startSessionScope.mockResourceHealthService.isResourceUnhealthy).toHaveBeenCalledWith(1);
      expect(startSessionScope.resourceMaintenanceService.canManageMaintenance).toHaveBeenCalled();
    });

    it('should allow maintenance users to start a session even when resource is unhealthy', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session' };

      startSessionScope.resourceRepository.findOne.mockResolvedValue(startSessionScope.mockResource);
      startSessionScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      startSessionScope.mockResourceHealthService.isResourceUnhealthy.mockResolvedValueOnce(true);
      startSessionScope.resourceMaintenanceService.canManageMaintenance.mockResolvedValue(true);

      startSessionScope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      startSessionScope.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      startSessionScope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      startSessionScope.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
      startSessionScope.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

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

      startSessionScope.resourceUsageRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(createdSession)
        .mockResolvedValueOnce(finalizedSession)
        .mockResolvedValueOnce(finalizedSession);

      const mockQueryBuilder = startSessionScope.createMockQueryBuilder(null);
      (startSessionScope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      const result = await startSessionScope.service.startSession(1, startSessionScope.mockUser, dto);
      expect(result).toEqual(finalizedSession);
    });

    it('should allow usage when resource is under maintenance but user can manage maintenance', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session' };

      // Mock resourceRepository.findOne to return the resource
      startSessionScope.resourceRepository.findOne.mockResolvedValue(startSessionScope.mockResource);

      // Mock maintenance service to indicate active maintenance but user can manage
      startSessionScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(true);
      startSessionScope.resourceMaintenanceService.canManageMaintenance.mockResolvedValue(true);

      // Mock other required services
      startSessionScope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      startSessionScope.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      startSessionScope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      startSessionScope.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
      startSessionScope.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

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
      startSessionScope.resourceUsageRepository.findOne
        .mockResolvedValueOnce(null) // For getActiveSession
        .mockResolvedValueOnce(createdSession) // For finding new session
        .mockResolvedValueOnce(finalizedSession) // Fetch finalized session for return
        .mockResolvedValueOnce(finalizedSession); // Emit event after commit

      const mockQueryBuilder = startSessionScope.createMockQueryBuilder(null);
      (startSessionScope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      const result = await startSessionScope.service.startSession(1, startSessionScope.mockUser, dto);

      expect(result).toEqual(finalizedSession);
      expect(startSessionScope.resourceMaintenanceService.hasActiveMaintenance).toHaveBeenCalledWith(
        1,
        expect.anything(),
      );
      expect(startSessionScope.resourceMaintenanceService.canManageMaintenance).toHaveBeenCalledWith(
        startSessionScope.mockUser,
        1,
        expect.anything(),
      );
      expect(startSessionScope.flowExecutorService.trackResourceActivity).toHaveBeenCalledWith(
        createdSession.resourceId,
      );
    });

    it('should reject start when billing is enabled and balance is insufficient', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session' };

      startSessionScope.resourceRepository.findOne.mockResolvedValue({
        id: 1,
        name: 'Test Resource',
        allowTakeOver: false,
        type: ResourceType.Machine,
      } as Resource);
      startSessionScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      startSessionScope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      startSessionScope.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      startSessionScope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      startSessionScope.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
      startSessionScope.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

      startSessionScope.billingService.handleResourceUsageStart.mockRejectedValue(new InsufficientBalanceError());

      // getActiveSession -> null, then fetch newly created session
      startSessionScope.resourceUsageRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 1,
        resourceId: 1,
        userId: 1,
        usageAction: ResourceUsageAction.Usage,
        endTime: null,
        user: { id: 1 } as User,
        resource: { id: 1 } as Resource,
      } as ResourceUsage);

      await expect(startSessionScope.service.startSession(1, { id: 1 } as User, dto)).rejects.toBeInstanceOf(
        InsufficientBalanceError,
      );

      expect(startSessionScope.billingService.handleResourceUsageStart).toHaveBeenCalled();
    });

    it('should start when billing is enabled and balance is sufficient', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session' };

      const mockResource: Resource = {
        id: 1,
        name: 'Test Resource',
        allowTakeOver: false,
        type: ResourceType.Machine,
      } as Resource;

      startSessionScope.resourceRepository.findOne.mockResolvedValue(mockResource);
      startSessionScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      startSessionScope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      startSessionScope.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      startSessionScope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      startSessionScope.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
      startSessionScope.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

      startSessionScope.billingService.handleResourceUsageStart.mockResolvedValue(undefined);

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

      startSessionScope.resourceUsageRepository.findOne
        .mockResolvedValueOnce(null) // For getActiveSession
        .mockResolvedValueOnce(createdSession) // For finding new session
        .mockResolvedValueOnce(finalizedSession) // For fetching finalized session to return
        .mockResolvedValueOnce(finalizedSession); // For emitUsageEvent

      const mockQueryBuilder = startSessionScope.createMockQueryBuilder(null);
      (startSessionScope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      const result = await startSessionScope.service.startSession(1, { id: 1 } as User, dto);

      expect(result).toMatchObject({ id: 1, resourceId: 1, userId: 1, endTime: null, isFinalized: true });
      expect(startSessionScope.billingService.handleResourceUsageStart).toHaveBeenCalled();
      expect(mockQueryBuilder.insert).toHaveBeenCalled();
      expect(startSessionScope.eventEmitter.emitAsync).toHaveBeenCalledWith(
        ResourceSessionStartedEvent.EVENT_NAME,
        expect.any(Object),
      );
      expect(startSessionScope.flowExecutorService.trackResourceActivity).toHaveBeenCalledWith(
        createdSession.resourceId,
      );
      expect(startSessionScope.mockAuditService.recordResource).toHaveBeenCalledWith({
        action: 'usage_session.started',
        actorId: 1,
        authenticationMethod: 'session',
        subjectId: 1,
        details: { usageId: 1, usageUserId: 1 },
      });
    });
  });

  describe('supervised start', () => {
    const supervisedStartScope = createSupervisedStartFixture(scope);

    it('starts a supervised session, sets supervisorUserId, and emits the auto-promotion counter event', async () => {
      const dto: StartUsageSessionDto = { notes: 'Supervised run' };
      supervisedStartScope.resourceRepository.findOne.mockResolvedValue(
        supervisedStartScope.supervisedResource(SupervisionMode.SUPERVISION_ALLOWED),
      );
      supervisedStartScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      supervisedStartScope.userRepository.findOne.mockResolvedValue(supervisedStartScope.supervisor);
      supervisedStartScope.resourceIntroducersService.isIntroducer.mockResolvedValue(true);

      const { finalizedSession, mockQueryBuilder } = supervisedStartScope.mockSuccessfulSessionCreation(2);

      const result = await supervisedStartScope.service.startSession(1, supervisedStartScope.requester, dto, {
        supervisorUserId: 2,
      });

      expect(result).toEqual(finalizedSession);
      expect(mockQueryBuilder.values).toHaveBeenCalledWith(expect.objectContaining({ supervisorUserId: 2 }));

      const counterEmit = supervisedStartScope.eventEmitter.emit.mock.calls.find(
        (c) => c[0] === ResourceSupervisedUsageStartedEvent.EVENT_NAME,
      );
      expect(counterEmit).toBeDefined();
      const payload = counterEmit?.[1] as ResourceSupervisedUsageStartedEvent;
      expect(payload).toBeInstanceOf(ResourceSupervisedUsageStartedEvent);
      expect(payload).toMatchObject({ resourceId: 1, userId: 1, supervisorUserId: 2 });
    });

    it('rejects a resource manager who is not also an introducer', async () => {
      const dto: StartUsageSessionDto = {};
      const adminSupervisor = { id: 2, username: 'admin' } as User;
      supervisedStartScope.resourceRepository.findOne.mockResolvedValue(
        supervisedStartScope.supervisedResource(SupervisionMode.SUPERVISION_ALLOWED),
      );
      supervisedStartScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      supervisedStartScope.userRepository.findOne.mockResolvedValue(adminSupervisor);
      supervisedStartScope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      supervisedStartScope.mockRbacService.getEffectivePermissions.mockResolvedValue(new Set(['resources.update']));

      await expect(
        supervisedStartScope.service.startSession(1, supervisedStartScope.requester, dto, { supervisorUserId: 2 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows a supervised start on SUPERVISION_REQUIRED even for an introduced user', async () => {
      const dto: StartUsageSessionDto = {};
      supervisedStartScope.resourceRepository.findOne.mockResolvedValue(
        supervisedStartScope.supervisedResource(SupervisionMode.SUPERVISION_REQUIRED),
      );
      supervisedStartScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      supervisedStartScope.userRepository.findOne.mockResolvedValue(supervisedStartScope.supervisor);
      supervisedStartScope.resourceIntroducersService.isIntroducer.mockResolvedValue(true);

      supervisedStartScope.mockSuccessfulSessionCreation(2);

      await expect(
        supervisedStartScope.service.startSession(1, supervisedStartScope.requester, dto, { supervisorUserId: 2 }),
      ).resolves.toMatchObject({
        supervisorUserId: 2,
      });
    });

    it('rejects self-supervision', async () => {
      supervisedStartScope.resourceRepository.findOne.mockResolvedValue(
        supervisedStartScope.supervisedResource(SupervisionMode.SUPERVISION_ALLOWED),
      );
      supervisedStartScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);

      await expect(
        supervisedStartScope.service.startSession(
          1,
          supervisedStartScope.requester,
          {},
          { supervisorUserId: supervisedStartScope.requester.id },
        ),
      ).rejects.toThrow(new BadRequestException('You cannot supervise your own session'));
    });

    it('rejects a maintainer who is not also an introducer', async () => {
      supervisedStartScope.resourceRepository.findOne.mockResolvedValue(
        supervisedStartScope.supervisedResource(SupervisionMode.SUPERVISION_ALLOWED),
      );
      supervisedStartScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      supervisedStartScope.userRepository.findOne.mockResolvedValue(supervisedStartScope.supervisor);
      supervisedStartScope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);

      await expect(
        supervisedStartScope.service.startSession(1, supervisedStartScope.requester, {}, { supervisorUserId: 2 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('accepts an applicable Resource Group introducer', async () => {
      supervisedStartScope.resourceRepository.findOne.mockResolvedValue(
        supervisedStartScope.supervisedResource(SupervisionMode.SUPERVISION_ALLOWED),
      );
      supervisedStartScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      supervisedStartScope.userRepository.findOne.mockResolvedValue(supervisedStartScope.supervisor);
      supervisedStartScope.resourceIntroducersService.isIntroducer.mockResolvedValue(true);
      supervisedStartScope.mockSuccessfulSessionCreation(2);

      await expect(
        supervisedStartScope.service.startSession(1, supervisedStartScope.requester, {}, { supervisorUserId: 2 }),
      ).resolves.toMatchObject({
        supervisorUserId: 2,
      });
      expect(supervisedStartScope.resourceIntroducersService.isIntroducer).toHaveBeenCalledWith(
        1,
        2,
        true,
        expect.anything(),
      );
    });

    it('rejects a supervised start when the resource does not allow supervision', async () => {
      supervisedStartScope.resourceRepository.findOne.mockResolvedValue(
        supervisedStartScope.supervisedResource(SupervisionMode.INTRODUCTION_REQUIRED),
      );
      supervisedStartScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      supervisedStartScope.userRepository.findOne.mockResolvedValue(supervisedStartScope.supervisor);

      await expect(
        supervisedStartScope.service.startSession(1, supervisedStartScope.requester, {}, { supervisorUserId: 2 }),
      ).rejects.toThrow(new BadRequestException('This resource does not support supervised sessions'));
    });

    it('rejects an unknown supervisor', async () => {
      supervisedStartScope.resourceRepository.findOne.mockResolvedValue(
        supervisedStartScope.supervisedResource(SupervisionMode.SUPERVISION_ALLOWED),
      );
      supervisedStartScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      supervisedStartScope.userRepository.findOne.mockResolvedValue(null);

      await expect(
        supervisedStartScope.service.startSession(1, supervisedStartScope.requester, {}, { supervisorUserId: 999 }),
      ).rejects.toThrow(new NotFoundException('Supervisor with ID 999 not found'));
    });

    it('blocks a solo start on SUPERVISION_REQUIRED even for an introduced user', async () => {
      supervisedStartScope.resourceRepository.findOne.mockResolvedValue(
        supervisedStartScope.supervisedResource(SupervisionMode.SUPERVISION_REQUIRED),
      );
      supervisedStartScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      supervisedStartScope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);

      await expect(supervisedStartScope.service.startSession(1, supervisedStartScope.requester, {})).rejects.toThrow(
        new BadRequestException('This resource requires a supervisor; request a supervised session instead'),
      );
    });
  });
});
