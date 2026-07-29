import { Test, TestingModule } from '@nestjs/testing';
import { ResourceUsageService } from './resourceUsage.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Resource,
  ResourceUsage,
  ResourceType,
  ResourceUsageAction,
  User,
  ResourceBillingConfiguration,
  ResourceFlowNodeType,
  SupervisionMode,
} from '@attraccess/database-entities';
import { Repository, IsNull, SelectQueryBuilder } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { EndUsageSessionDto } from './dtos/endUsageSession.dto';
import { ResourcesService } from '../resources.service';
import { ResourceIntroductionsService } from '../introductions/resouceIntroductions.service';
import { ResourceIntroducersService } from '../introducers/resourceIntroducers.service';
import { ResourceGroupsIntroductionsService } from '../groups/introductions/resourceGroups.introductions.service';
import { ResourceGroupsIntroducersService } from '../groups/introducers/resourceGroups.introducers.service';
import { ResourceGroupsService } from '../groups/resourceGroups.service';
import { ResourceRetrainingService } from '../retraining/resourceRetraining.service';
import { ResourceMaintenanceService } from '../maintenances/maintenance.service';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';
import { ResourceUsageImpossibleMaintenanceInProgressException } from '../../exceptions/resource.maintenance.inUse.exception';
import {
  ResourceSessionStartedEvent,
  ResourceUsageSessionTakenOverEvent,
  ResourceUsageSessionEndedEvent,
  ResourceUsageNoteAddedEvent,
  ResourceSupervisedUsageStartedEvent,
  ResourceSupervisedUsageEndedEvent,
} from './events/resource-usage.events';
import { BillingService } from '../../billing/billing.service';
import { InsufficientBalanceError } from '../../billing/errors/insufficient-balance.error';
import { ResourceInUseError } from './errors/resource-in-use.error';
import { ResourceFlowsExecutorService } from '../flows/resource-flows-executor.service';
import { ProjectsService } from '../../projects/projects.service';
import { ResourceFormsService } from '../forms/forms.service';
import { MetricsService } from '../../metrics/metrics.service';
import { PluginEventsService } from '../../plugin-system/plugin-events.service';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';

const mockRbacService = {
  getEffectivePermissions: jest.fn().mockResolvedValue(new Set<string>()),
};

const mockPluginEventsService = {
  emit: jest.fn(),
  emitAsync: jest.fn(),
  onEvent: jest.fn(),
};

const mockMetricsService = {
  resourceUsageSessionsTotal: { inc: jest.fn() },
  resourceUsageSessionsActive: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
  resourceUsageDurationSeconds: { observe: jest.fn() },
};

describe('ResourceUsageService', () => {
  let service: ResourceUsageService;
  let resourceUsageRepository: jest.Mocked<Repository<ResourceUsage>>;
  let resourceRepository: jest.Mocked<Repository<Resource>>;
  let userRepository: jest.Mocked<Repository<User>>;
  let resourceIntroductionService: jest.Mocked<ResourceIntroductionsService>;
  let resourceIntroducersService: jest.Mocked<ResourceIntroducersService>;
  let resourceGroupsIntroductionsService: jest.Mocked<ResourceGroupsIntroductionsService>;
  let resourceGroupsIntroducersService: jest.Mocked<ResourceGroupsIntroducersService>;
  let resourceGroupsService: jest.Mocked<ResourceGroupsService>;
  let resourceMaintenanceService: jest.Mocked<ResourceMaintenanceService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let billingService: jest.Mocked<BillingService>;
  let projectsService: jest.Mocked<ProjectsService>;
  let flowExecutorService: { runFlow: jest.Mock; trackResourceActivity: jest.Mock };
  // Expose transactional entity manager for assertions
  let transactionalEntityManager: {
    createQueryBuilder: jest.Mock;
    getRepository: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
  };

  const mockRepository = () => ({
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      getMany: jest.fn(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    })),
  });

  const mockEventEmitter = {
    emit: jest.fn(),
    emitAsync: jest.fn().mockResolvedValue([]),
  };

  const mockResourcesService = {
    getResourceById: jest.fn(),
  };

  const mockResourceIntroductionService = {
    hasValidIntroduction: jest.fn(),
    canGiveIntroductions: jest.fn(),
  };

  const mockResourceIntroducersService = {
    isIntroducer: jest.fn(),
    canMaintain: jest.fn(),
  };

  const mockResourceGroupsIntroductionsService = {
    hasValidIntroduction: jest.fn(),
  };

  const mockResourceGroupsIntroducersService = {
    isIntroducer: jest.fn(),
  };

  const mockResourceGroupsService = {
    getGroupsOfResource: jest.fn(),
  };

  const mockResourceRetrainingService = {
    isResourceIntroductionBlocked: jest.fn().mockResolvedValue(false),
    isGroupIntroductionBlocked: jest.fn().mockResolvedValue(false),
    getResourceRetrainingStatus: jest.fn(),
  };

  const mockResourceMaintenanceService = {
    hasActiveMaintenance: jest.fn(),
    canManageMaintenance: jest.fn(),
  };

  const mockResourceHealthService = {
    isResourceUnhealthy: jest.fn().mockResolvedValue(false),
    reportHealth: jest.fn(),
    getSummary: jest.fn(),
    listForResource: jest.fn(),
  };

  const mockBillingService = {
    getResourceBillingConfiguration: jest.fn(),
    getBalance: jest.fn(),
    handleResourceUsageStart: jest.fn(),
    chargeForResourceUsage: jest.fn(),
  } as unknown as jest.Mocked<BillingService>;

  const mockProjectsService = {
    findOneById: jest.fn(),
  } as unknown as jest.Mocked<ProjectsService>;

  const mockResourceFormsService = {
    getFormsForAction: jest.fn(),
    saveRequiredSubmissions: jest.fn(),
  } as unknown as jest.Mocked<ResourceFormsService>;

  type MockQueryBuilder = {
    where: jest.Mock;
    andWhere: jest.Mock;
    getOne: jest.Mock;
    insert: jest.Mock;
    into: jest.Mock;
    values: jest.Mock;
    execute: jest.Mock;
    update: jest.Mock;
    set: jest.Mock;
  };

  const createMockQueryBuilder = (getOneResult: ResourceUsage | null = null): MockQueryBuilder => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(getOneResult),
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ identifiers: [{ id: 1 }] }),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceUsageService,
        {
          provide: getRepositoryToken(Resource),
          useFactory: mockRepository,
        },
        {
          provide: getRepositoryToken(ResourceUsage),
          useFactory: mockRepository,
        },
        {
          provide: getRepositoryToken(User),
          useFactory: mockRepository,
        },
        {
          provide: ResourcesService,
          useValue: mockResourcesService,
        },
        {
          provide: ResourceIntroductionsService,
          useValue: mockResourceIntroductionService,
        },
        {
          provide: ResourceIntroducersService,
          useValue: mockResourceIntroducersService,
        },
        {
          provide: ResourceGroupsIntroductionsService,
          useValue: mockResourceGroupsIntroductionsService,
        },
        {
          provide: ResourceGroupsIntroducersService,
          useValue: mockResourceGroupsIntroducersService,
        },
        {
          provide: ResourceGroupsService,
          useValue: mockResourceGroupsService,
        },
        {
          provide: ResourceRetrainingService,
          useValue: mockResourceRetrainingService,
        },
        {
          provide: ResourceMaintenanceService,
          useValue: mockResourceMaintenanceService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: BillingService,
          useValue: mockBillingService,
        },
        {
          provide: ProjectsService,
          useValue: mockProjectsService,
        },
        {
          provide: require('../flows/resource-flows-executor.service').ResourceFlowsExecutorService,
          useValue: {
            runFlow: jest.fn().mockResolvedValue([]),
            trackResourceActivity: jest.fn(),
          },
        },
        {
          provide: ResourceFormsService,
          useValue: mockResourceFormsService,
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
        {
          provide: require('../health/resource-health.service').ResourceHealthService,
          useValue: mockResourceHealthService,
        },
        {
          provide: PluginEventsService,
          useValue: mockPluginEventsService,
        },
        {
          provide: RbacService,
          useValue: mockRbacService,
        },
      ],
    }).compile();

    service = module.get<ResourceUsageService>(ResourceUsageService);
    resourceRepository = module.get(getRepositoryToken(Resource));
    resourceUsageRepository = module.get(getRepositoryToken(ResourceUsage));
    userRepository = module.get(getRepositoryToken(User));
    resourceIntroductionService = module.get(ResourceIntroductionsService);
    resourceIntroducersService = module.get(ResourceIntroducersService);
    resourceGroupsIntroductionsService = module.get(ResourceGroupsIntroductionsService);
    resourceGroupsIntroducersService = module.get(ResourceGroupsIntroducersService);
    resourceGroupsService = module.get(ResourceGroupsService);
    resourceMaintenanceService = module.get(ResourceMaintenanceService);
    eventEmitter = module.get(EventEmitter2);
    billingService = module.get(BillingService);
    projectsService = module.get(ProjectsService);
    flowExecutorService = module.get(ResourceFlowsExecutorService) as unknown as {
      runFlow: jest.Mock;
      trackResourceActivity: jest.Mock;
    };

    // Provide transaction-capable manager on the repository
    transactionalEntityManager = {
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      })),
      update: jest.fn().mockResolvedValue(undefined),
      // Ensure code paths that use getRepository(Entity).findOne work in tests
      getRepository: jest.fn((entity) => {
        if (entity === Resource) {
          return { findOne: resourceRepository.findOne } as unknown as Repository<Resource>;
        }
        if (entity === ResourceUsage) {
          return { findOne: resourceUsageRepository.findOne } as unknown as Repository<ResourceUsage>;
        }
        if (entity === User) {
          return { findOne: userRepository.findOne } as unknown as Repository<User>;
        }
        return { findOne: jest.fn() } as unknown as Repository<unknown>;
      }),
      // direct calls used in service
      findOne: jest.fn((entity, opts) => {
        if (entity === ResourceUsage) {
          return resourceUsageRepository.findOne(opts as never);
        }
        if (entity === Resource) {
          return resourceRepository.findOne(opts as never);
        }
        return null;
      }),
    } as unknown as { createQueryBuilder: jest.Mock; getRepository: jest.Mock; findOne: jest.Mock; update: jest.Mock };

    // @ts-expect-error augment mock with manager
    resourceUsageRepository.manager = {
      transaction: jest.fn(async (cb: (em: typeof transactionalEntityManager) => Promise<unknown>) =>
        cb(transactionalEntityManager),
      ),
    } as unknown as { transaction: jest.Mock };

    // Silence and stub billing call inside transaction
    billingService.chargeForResourceUsage.mockResolvedValue(undefined);
    projectsService.findOneById.mockImplementation(
      async (_userId, projectId) =>
        ({
          id: projectId,
        }) as never,
    );

    // Default: billing disabled to avoid interfering with tests that don't explicitly mock billing
    billingService.getResourceBillingConfiguration.mockResolvedValue({
      id: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      resourceId: 1,
      resource: undefined as unknown as never,
      creditsPerUsage: 0,
      creditsPerMinute: 0,
    } as ResourceBillingConfiguration);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockRbacService.getEffectivePermissions.mockResolvedValue(new Set<string>());
  });

  describe('startSession', () => {
    const mockUser: User = { id: 1 } as User;
    const mockResource: Resource = {
      id: 1,
      name: 'Test Resource',
      allowTakeOver: false,
      type: ResourceType.Machine,
    } as Resource;
    const mockResourceWithTakeOver: Resource = {
      id: 1,
      name: 'Test Resource',
      allowTakeOver: true,
      type: ResourceType.Machine,
    } as Resource;

    it('should start a session successfully when no active session exists', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session' };

      // Mock resourceRepository.findOne to return the resource
      resourceRepository.findOne.mockResolvedValue(mockResource);
      resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
      resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

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
      resourceUsageRepository.findOne
        .mockResolvedValueOnce(null) // 1) getActiveSession
        .mockResolvedValueOnce(createdSession) // 2) fetch newly created session
        .mockResolvedValueOnce(finalizedSession) // 3) fetch finalized session for return
        .mockResolvedValueOnce(finalizedSession); // 4) emitUsageEvent fetch by id

      const mockQueryBuilder = createMockQueryBuilder(null);
      // Service uses transactionalEntityManager.createQueryBuilder, not repo
      (transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      const result = await service.startSession(1, mockUser, dto);

      expect(result).toMatchObject({
        id: 1,
        resourceId: 1,
        userId: 1,
        usageAction: ResourceUsageAction.Usage,
        endTime: null,
      });
      expect(transactionalEntityManager.createQueryBuilder).toHaveBeenCalled();
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
      });
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(ResourceSessionStartedEvent.EVENT_NAME, expect.any(Object));

      const emitted = eventEmitter.emitAsync.mock.calls.find((c) => c[0] === ResourceSessionStartedEvent.EVENT_NAME);
      expect(emitted).toBeDefined();
      const usageEvent = emitted?.[1] as ResourceSessionStartedEvent;
      expect(usageEvent).toBeInstanceOf(ResourceSessionStartedEvent);
      expect(usageEvent.usage).toMatchObject({
        resourceId: 1,
        userId: 1,
        usageAction: ResourceUsageAction.Usage,
        endTime: null,
        isFinalized: true,
      });
      expect(flowExecutorService.trackResourceActivity).toHaveBeenCalledTimes(1);
      expect(flowExecutorService.trackResourceActivity).toHaveBeenCalledWith(createdSession.resourceId);
    });

    it('should throw error when resource does not exist', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session' };

      // Mock resourceRepository.findOne to return null (resource not found)
      resourceRepository.findOne.mockResolvedValue(null);

      await expect(service.startSession(1, mockUser, dto)).rejects.toThrow(ResourceNotFoundException);
    });

    it('should throw error when user has not completed introduction', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session' };

      // Mock resourceRepository.findOne to return the resource
      resourceRepository.findOne.mockResolvedValue(mockResource);
      resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      resourceIntroductionService.hasValidIntroduction.mockResolvedValue(false);
      resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
      resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

      await expect(service.startSession(1, mockUser, dto)).rejects.toThrow(BadRequestException);
      expect(resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledWith(1, 1, expect.anything());
    });

    it('should throw error when active session exists and no takeover requested', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session' };

      // Mock resourceRepository.findOne to return the resource
      resourceRepository.findOne.mockResolvedValue(mockResource);
      resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
      resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

      const mockActiveSession = { id: 1, userId: 2, user: { id: 2 } as User } as ResourceUsage;
      // Mock getActiveSession to return an active session
      resourceUsageRepository.findOne.mockResolvedValue(mockActiveSession);

      await expect(service.startSession(1, mockUser, dto)).rejects.toBeInstanceOf(ResourceInUseError);
    });

    it('should throw error when takeover requested but resource does not allow it', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session', forceTakeOver: true };

      // Mock resourceRepository.findOne to return the resource (allowTakeOver: false)
      resourceRepository.findOne.mockResolvedValue(mockResource);
      resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
      resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

      const mockActiveSession = { id: 1, userId: 2, user: { id: 2 } as User } as ResourceUsage;
      // Mock getActiveSession to return an active session
      resourceUsageRepository.findOne.mockResolvedValue(mockActiveSession);

      await expect(service.startSession(1, mockUser, dto)).rejects.toThrow(
        new BadRequestException('This resource does not allow overtaking'),
      );
    });

    it('should successfully takeover when resource allows it', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session', forceTakeOver: true };

      // Mock resourceRepository.findOne to return the resource (allowTakeOver: true)
      resourceRepository.findOne.mockResolvedValue(mockResourceWithTakeOver);
      resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
      resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

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
      resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession) // 1) getActiveSession
        .mockResolvedValueOnce(updatedEndedSession) // 2) fetch updated ended session (in-transaction)
        .mockResolvedValueOnce(mockNewUsage) // 3) fetch newly created session (in-transaction)
        .mockResolvedValueOnce(finalizedNewUsage) // 4) fetch finalized new session (in-transaction)
        .mockResolvedValueOnce(updatedEndedSession) // 5) emitUsageEvent fetch for ended session (after commit)
        .mockResolvedValueOnce(finalizedNewUsage) // 6) emitUsageEvent fetch for newly created session (after commit)
        .mockResolvedValueOnce(finalizedNewUsage); // 7) safeguard for any additional fetches

      const mockUpdateQueryBuilder = createMockQueryBuilder(null);
      const mockInsertQueryBuilder = createMockQueryBuilder(null);

      // Service uses transactionalEntityManager.createQueryBuilder
      (transactionalEntityManager.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>) // For ending session
        .mockReturnValueOnce(mockInsertQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>); // For creating new session

      const result = await service.startSession(1, mockUser, dto);

      expect(result).toBe(finalizedNewUsage);
      expect(mockUpdateQueryBuilder.update).toHaveBeenCalledWith(ResourceUsage);
      expect(mockUpdateQueryBuilder.set).toHaveBeenCalledWith({
        endTime: expect.any(Date),
        endNotes: 'Session ended due to takeover by user 1',
      });
      expect(mockUpdateQueryBuilder.where).toHaveBeenCalledWith('id = :id', { id: 1 });
      expect(mockInsertQueryBuilder.insert).toHaveBeenCalled();
      // One event for the ended previous session (emitAsync) and one takeover event (emit)
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(ResourceSessionStartedEvent.EVENT_NAME, expect.any(Object));
      expect(eventEmitter.emit).toHaveBeenCalledWith(ResourceUsageSessionTakenOverEvent.EVENT_NAME, expect.any(Object));

      const usageEmit = eventEmitter.emitAsync.mock.calls.find((c) => c[0] === ResourceSessionStartedEvent.EVENT_NAME);
      const usagePayload = usageEmit?.[1] as ResourceSessionStartedEvent;
      expect(usagePayload).toBeInstanceOf(ResourceSessionStartedEvent);
      expect(usagePayload.usage).toMatchObject({ id: 1, userId: 2, endNotes: expect.stringContaining('takeover') });

      const takeoverEmit = eventEmitter.emit.mock.calls.find((c) => c[0] === ResourceUsageSessionTakenOverEvent.EVENT_NAME);
      const takeoverPayload = takeoverEmit?.[1] as ResourceUsageSessionTakenOverEvent;
      expect(takeoverPayload).toBeInstanceOf(ResourceUsageSessionTakenOverEvent);
      expect(takeoverPayload.resource).toMatchObject({
        id: mockResourceWithTakeOver.id,
        name: mockResourceWithTakeOver.name,
      });
      expect(takeoverPayload.newUser).toMatchObject({ id: mockUser.id });
      expect(takeoverPayload.previousUser).toMatchObject({ id: mockActiveSession.user?.id });
      expect(takeoverPayload.takeoverTime).toBeInstanceOf(Date);

      // Previous user is charged for ended session
      expect(billingService.chargeForResourceUsage).toHaveBeenCalledTimes(1);
      expect(billingService.chargeForResourceUsage).toHaveBeenCalledWith(updatedEndedSession, expect.anything());

      // Ensure the charged usage belongs to the previous user, not the new one
      const chargedArg = (billingService.chargeForResourceUsage as unknown as jest.Mock).mock
        .calls[0][0] as ResourceUsage;
      expect(chargedArg.id).toBe(updatedEndedSession.id);
      expect(chargedArg.user?.id).toBe(mockActiveSession.user.id);
      // Ensure the new session was not charged
      const chargedIds = (billingService.chargeForResourceUsage as unknown as jest.Mock).mock.calls.map(
        (c) => c[0]?.id,
      );
      expect(chargedIds).not.toContain(mockNewUsage.id);
      expect(flowExecutorService.trackResourceActivity).toHaveBeenCalledTimes(1);
      expect(flowExecutorService.trackResourceActivity).toHaveBeenCalledWith(mockNewUsage.resourceId);
    });

    it('should trigger only TAKEOVER flow on takeover and not STARTED/STOPPED; billing unchanged', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session', forceTakeOver: true };

      resourceRepository.findOne.mockResolvedValue(mockResourceWithTakeOver);
      resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
      resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

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
      const mockNewUsage = { id: 11, resourceId: 1, userId: 1 } as ResourceUsage;

      resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession) // getActiveSession
        .mockResolvedValueOnce(updatedEndedSession) // fetch updated ended session
        .mockResolvedValueOnce(mockNewUsage) // fetch new session inside tx
        .mockResolvedValueOnce(updatedEndedSession) // emitUsageEvent for ended
        .mockResolvedValueOnce(mockNewUsage); // emitUsageEvent for started

      const mockUpdateQueryBuilder = createMockQueryBuilder(null);
      const mockInsertQueryBuilder = createMockQueryBuilder(null);

      (transactionalEntityManager.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>)
        .mockReturnValueOnce(mockInsertQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>);

      await service.startSession(1, mockUser, dto);

      // Only one flow call and it must be TAKEOVER
      expect(flowExecutorService.runFlow).toHaveBeenCalledTimes(1);
      const [resId, nodeType, payload] = flowExecutorService.runFlow.mock.calls[0];
      expect(resId).toBe(mockActiveSession.resourceId ?? 1);
      expect(nodeType).toBe(ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER);
      expect(payload).toMatchObject({ newUser: { id: mockUser.id }, oldUser: { id: mockActiveSession.user.id } });

      // Billing start should still be called exactly once for the new session
      expect(billingService.handleResourceUsageStart).toHaveBeenCalledTimes(1);
      // Billing charge should occur for previous ended session exactly once
      expect(billingService.chargeForResourceUsage).toHaveBeenCalledTimes(1);
      const chargedArg = (billingService.chargeForResourceUsage as unknown as jest.Mock).mock
        .calls[0][0] as ResourceUsage;
      expect(chargedArg.user?.id).toBe(mockActiveSession.user.id);
      const chargedIds = (billingService.chargeForResourceUsage as unknown as jest.Mock).mock.calls.map(
        (c) => c[0]?.id,
      );
      expect(chargedIds).not.toContain(mockNewUsage.id);
      expect(flowExecutorService.trackResourceActivity).toHaveBeenCalledTimes(1);
      expect(flowExecutorService.trackResourceActivity).toHaveBeenCalledWith(mockNewUsage.resourceId);
    });

    it('should throw ResourceMaintenanceInUseException when resource is under maintenance and user cannot manage maintenance', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session' };

      // Mock resourceRepository.findOne to return the resource
      resourceRepository.findOne.mockResolvedValue(mockResource);

      // Mock maintenance service to indicate active maintenance
      resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(true);
      resourceMaintenanceService.canManageMaintenance.mockResolvedValue(false);

      await expect(service.startSession(1, mockUser, dto)).rejects.toThrow(
        ResourceUsageImpossibleMaintenanceInProgressException,
      );
      expect(resourceMaintenanceService.hasActiveMaintenance).toHaveBeenCalledWith(1, expect.anything());
      expect(resourceMaintenanceService.canManageMaintenance).toHaveBeenCalledWith(mockUser, 1, expect.anything());
    });

    it('should block non-maintenance users when active maintenance exists including schedule-triggered (same as manual)', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session' };

      resourceRepository.findOne.mockResolvedValue(mockResource);
      // hasActiveMaintenance does not filter by origin: schedule-created maintenances use the same
      // table and criteria (startTime <= now, endTime IS NULL), so they block the same as manual ones
      resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(true);
      resourceMaintenanceService.canManageMaintenance.mockResolvedValue(false);

      await expect(service.startSession(1, mockUser, dto)).rejects.toThrow(
        ResourceUsageImpossibleMaintenanceInProgressException,
      );
      expect(resourceMaintenanceService.hasActiveMaintenance).toHaveBeenCalledWith(1, expect.anything());
      expect(resourceMaintenanceService.canManageMaintenance).toHaveBeenCalledWith(mockUser, 1, expect.anything());
    });

    it('should throw ResourceUnhealthyException when resource is unhealthy and user cannot manage maintenance', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session' };

      resourceRepository.findOne.mockResolvedValue(mockResource);
      resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      mockResourceHealthService.isResourceUnhealthy.mockResolvedValueOnce(true);
      resourceMaintenanceService.canManageMaintenance.mockResolvedValue(false);

      const { ResourceUnhealthyException } = require('../../exceptions/resource.unhealthy.exception');

      await expect(service.startSession(1, mockUser, dto)).rejects.toBeInstanceOf(ResourceUnhealthyException);
      expect(mockResourceHealthService.isResourceUnhealthy).toHaveBeenCalledWith(1);
      expect(resourceMaintenanceService.canManageMaintenance).toHaveBeenCalled();
    });

    it('should allow maintenance users to start a session even when resource is unhealthy', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session' };

      resourceRepository.findOne.mockResolvedValue(mockResource);
      resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      mockResourceHealthService.isResourceUnhealthy.mockResolvedValueOnce(true);
      resourceMaintenanceService.canManageMaintenance.mockResolvedValue(true);

      resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
      resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

      const createdSession = {
        id: 1,
        resourceId: 1,
        userId: 1,
        usageAction: ResourceUsageAction.Usage,
        startTime: new Date(),
        endTime: null,
        isFinalized: false,
      } as ResourceUsage;
      const finalizedSession = { ...createdSession, isFinalized: true };

      resourceUsageRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(createdSession)
        .mockResolvedValueOnce(finalizedSession)
        .mockResolvedValueOnce(finalizedSession);

      const mockQueryBuilder = createMockQueryBuilder(null);
      (transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      const result = await service.startSession(1, mockUser, dto);
      expect(result).toEqual(finalizedSession);
    });

    it('should allow usage when resource is under maintenance but user can manage maintenance', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session' };

      // Mock resourceRepository.findOne to return the resource
      resourceRepository.findOne.mockResolvedValue(mockResource);

      // Mock maintenance service to indicate active maintenance but user can manage
      resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(true);
      resourceMaintenanceService.canManageMaintenance.mockResolvedValue(true);

      // Mock other required services
      resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
      resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

      const createdSession = {
        id: 1,
        resourceId: 1,
        userId: 1,
        usageAction: ResourceUsageAction.Usage,
        startTime: new Date(),
        endTime: null,
        isFinalized: false,
      } as ResourceUsage;
      const finalizedSession = { ...createdSession, isFinalized: true };

      // Mock getActiveSession to return null (no active session)
      resourceUsageRepository.findOne
        .mockResolvedValueOnce(null) // For getActiveSession
        .mockResolvedValueOnce(createdSession) // For finding new session
        .mockResolvedValueOnce(finalizedSession) // Fetch finalized session for return
        .mockResolvedValueOnce(finalizedSession); // Emit event after commit

      const mockQueryBuilder = createMockQueryBuilder(null);
      (transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      const result = await service.startSession(1, mockUser, dto);

      expect(result).toEqual(finalizedSession);
      expect(resourceMaintenanceService.hasActiveMaintenance).toHaveBeenCalledWith(1, expect.anything());
      expect(resourceMaintenanceService.canManageMaintenance).toHaveBeenCalledWith(mockUser, 1, expect.anything());
      expect(flowExecutorService.trackResourceActivity).toHaveBeenCalledWith(createdSession.resourceId);
    });

    it('should reject start when billing is enabled and balance is insufficient', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session' };

      resourceRepository.findOne.mockResolvedValue({
        id: 1,
        name: 'Test Resource',
        allowTakeOver: false,
        type: ResourceType.Machine,
      } as Resource);
      resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
      resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

      billingService.handleResourceUsageStart.mockRejectedValue(new InsufficientBalanceError());

      // getActiveSession -> null, then fetch newly created session
      resourceUsageRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 1,
        resourceId: 1,
        userId: 1,
        usageAction: ResourceUsageAction.Usage,
        endTime: null,
        user: { id: 1 } as User,
        resource: { id: 1 } as Resource,
      } as ResourceUsage);

      await expect(service.startSession(1, { id: 1 } as User, dto)).rejects.toBeInstanceOf(InsufficientBalanceError);

      expect(billingService.handleResourceUsageStart).toHaveBeenCalled();
    });

    it('should start when billing is enabled and balance is sufficient', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session' };

      const mockResource: Resource = {
        id: 1,
        name: 'Test Resource',
        allowTakeOver: false,
        type: ResourceType.Machine,
      } as Resource;

      resourceRepository.findOne.mockResolvedValue(mockResource);
      resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
      resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

      billingService.handleResourceUsageStart.mockResolvedValue(undefined);

      const createdSession = {
        id: 1,
        resourceId: 1,
        userId: 1,
        usageAction: ResourceUsageAction.Usage,
        startTime: new Date(),
        endTime: null,
        isFinalized: false,
      } as ResourceUsage;
      const finalizedSession = { ...createdSession, isFinalized: true };

      resourceUsageRepository.findOne
        .mockResolvedValueOnce(null) // For getActiveSession
        .mockResolvedValueOnce(createdSession) // For finding new session
        .mockResolvedValueOnce(finalizedSession) // For fetching finalized session to return
        .mockResolvedValueOnce(finalizedSession); // For emitUsageEvent

      const mockQueryBuilder = createMockQueryBuilder(null);
      (transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      const result = await service.startSession(1, { id: 1 } as User, dto);

      expect(result).toMatchObject({ id: 1, resourceId: 1, userId: 1, endTime: null, isFinalized: true });
      expect(billingService.handleResourceUsageStart).toHaveBeenCalled();
      expect(mockQueryBuilder.insert).toHaveBeenCalled();
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(ResourceSessionStartedEvent.EVENT_NAME, expect.any(Object));
      expect(flowExecutorService.trackResourceActivity).toHaveBeenCalledWith(createdSession.resourceId);
    });
  });

  describe('supervised start', () => {
    const requester: User = { id: 1, username: 'requester' } as User;
    const supervisor: User = { id: 2, username: 'supervisor' } as User;

    const supervisedResource = (mode: SupervisionMode): Resource =>
      ({
        id: 1,
        name: 'Supervised Resource',
        allowTakeOver: false,
        type: ResourceType.Machine,
        supervisionMode: mode,
      }) as Resource;

    const mockSuccessfulSessionCreation = (supervisorUserId: number) => {
      const createdSession = {
        id: 1,
        resourceId: 1,
        userId: 1,
        usageAction: ResourceUsageAction.Usage,
        startTime: new Date(),
        endTime: null,
        isFinalized: false,
        supervisorUserId,
        user: { id: 1 } as User,
        resource: { id: 1 } as Resource,
      } as ResourceUsage;
      const finalizedSession = { ...createdSession, isFinalized: true };

      resourceUsageRepository.findOne
        .mockResolvedValueOnce(null) // getActiveSession
        .mockResolvedValueOnce(createdSession) // newly created session
        .mockResolvedValueOnce(finalizedSession) // finalized session for return
        .mockResolvedValueOnce(finalizedSession); // emitUsageEvent fetch

      const mockQueryBuilder = createMockQueryBuilder(null);
      (transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );
      return { finalizedSession, mockQueryBuilder };
    };

    it('starts a supervised session, sets supervisorUserId, and emits the auto-promotion counter event', async () => {
      const dto: StartUsageSessionDto = { notes: 'Supervised run' };
      resourceRepository.findOne.mockResolvedValue(supervisedResource(SupervisionMode.SUPERVISION_ALLOWED));
      resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      userRepository.findOne.mockResolvedValue(supervisor);
      resourceIntroducersService.canMaintain.mockResolvedValue(true);

      const { finalizedSession, mockQueryBuilder } = mockSuccessfulSessionCreation(2);

      const result = await service.startSession(1, requester, dto, { supervisorUserId: 2 });

      expect(result).toEqual(finalizedSession);
      expect(mockQueryBuilder.values).toHaveBeenCalledWith(expect.objectContaining({ supervisorUserId: 2 }));

      const counterEmit = eventEmitter.emit.mock.calls.find((c) => c[0] === ResourceSupervisedUsageStartedEvent.EVENT_NAME);
      expect(counterEmit).toBeDefined();
      const payload = counterEmit?.[1] as ResourceSupervisedUsageStartedEvent;
      expect(payload).toBeInstanceOf(ResourceSupervisedUsageStartedEvent);
      expect(payload).toMatchObject({ resourceId: 1, userId: 1, supervisorUserId: 2 });
    });

    it('accepts a supervisor authorized via resources.update permission even without an introducer role', async () => {
      const dto: StartUsageSessionDto = {};
      const adminSupervisor = { id: 2, username: 'admin' } as User;
      resourceRepository.findOne.mockResolvedValue(supervisedResource(SupervisionMode.SUPERVISION_ALLOWED));
      resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      userRepository.findOne.mockResolvedValue(adminSupervisor);
      resourceIntroducersService.canMaintain.mockResolvedValue(false);
      mockRbacService.getEffectivePermissions.mockResolvedValue(new Set(['resources.update']));

      mockSuccessfulSessionCreation(2);

      await expect(service.startSession(1, requester, dto, { supervisorUserId: 2 })).resolves.toMatchObject({
        supervisorUserId: 2,
      });
    });

    it('allows a supervised start on SUPERVISION_REQUIRED even for an introduced user', async () => {
      const dto: StartUsageSessionDto = {};
      resourceRepository.findOne.mockResolvedValue(supervisedResource(SupervisionMode.SUPERVISION_REQUIRED));
      resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      userRepository.findOne.mockResolvedValue(supervisor);
      resourceIntroducersService.canMaintain.mockResolvedValue(true);

      mockSuccessfulSessionCreation(2);

      await expect(service.startSession(1, requester, dto, { supervisorUserId: 2 })).resolves.toMatchObject({
        supervisorUserId: 2,
      });
    });

    it('rejects self-supervision', async () => {
      resourceRepository.findOne.mockResolvedValue(supervisedResource(SupervisionMode.SUPERVISION_ALLOWED));
      resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);

      await expect(service.startSession(1, requester, {}, { supervisorUserId: requester.id })).rejects.toThrow(
        new BadRequestException('You cannot supervise your own session'),
      );
    });

    it('rejects a supervisor that is neither introducer/maintainer nor resource manager', async () => {
      resourceRepository.findOne.mockResolvedValue(supervisedResource(SupervisionMode.SUPERVISION_ALLOWED));
      resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      userRepository.findOne.mockResolvedValue(supervisor);
      resourceIntroducersService.canMaintain.mockResolvedValue(false);

      await expect(service.startSession(1, requester, {}, { supervisorUserId: 2 })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects a supervised start when the resource does not allow supervision', async () => {
      resourceRepository.findOne.mockResolvedValue(supervisedResource(SupervisionMode.INTRODUCTION_REQUIRED));
      resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      userRepository.findOne.mockResolvedValue(supervisor);

      await expect(service.startSession(1, requester, {}, { supervisorUserId: 2 })).rejects.toThrow(
        new BadRequestException('This resource does not support supervised sessions'),
      );
    });

    it('rejects an unknown supervisor', async () => {
      resourceRepository.findOne.mockResolvedValue(supervisedResource(SupervisionMode.SUPERVISION_ALLOWED));
      resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.startSession(1, requester, {}, { supervisorUserId: 999 })).rejects.toThrow(
        new NotFoundException('Supervisor with ID 999 not found'),
      );
    });

    it('blocks a solo start on SUPERVISION_REQUIRED even for an introduced user', async () => {
      resourceRepository.findOne.mockResolvedValue(supervisedResource(SupervisionMode.SUPERVISION_REQUIRED));
      resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);

      await expect(service.startSession(1, requester, {})).rejects.toThrow(
        new BadRequestException('This resource requires a supervisor; request a supervised session instead'),
      );
    });
  });

  describe('getActiveSession', () => {
    it('should return active session when it exists', async () => {
      const mockActiveSession = { id: 1, resourceId: 1, userId: 1, user: { id: 1 } as User } as ResourceUsage;
      resourceUsageRepository.findOne.mockResolvedValue(mockActiveSession);

      const result = await service.getActiveSession(1, true);

      expect(result).toBe(mockActiveSession);
      expect(resourceUsageRepository.findOne).toHaveBeenCalledWith({
        where: {
          resourceId: 1,
          endTime: IsNull(),
          isFinalized: true,
        },
        relations: ['user', 'resource', 'billingTransaction', 'project', 'supervisorUser'],
      });
    });

    it('should return null when no active session exists', async () => {
      resourceUsageRepository.findOne.mockResolvedValue(null);

      const result = await service.getActiveSession(1, true);

      expect(result).toBeNull();
    });
  });

  describe('endSession', () => {
    const mockUser: User = { id: 1 } as User;

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
      resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession) // 1) getActiveSession
        .mockResolvedValueOnce(mockUpdatedSession) // 2) emitUsageEvent fetch
        .mockResolvedValueOnce(mockUpdatedSession); // 3) fetch updated session to return

      const mockUpdateQueryBuilder = createMockQueryBuilder(null);
      // Ensure update(ResourceUsage) is called: our mock returns chainable builder
      (mockUpdateQueryBuilder.update as jest.Mock).mockReturnValue(mockUpdateQueryBuilder);
      resourceUsageRepository.createQueryBuilder.mockReturnValue(
        mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      const result = await service.endSession(1, mockUser, dto);

      expect(result).toBe(mockUpdatedSession);
      expect(resourceUsageRepository.manager.transaction).toHaveBeenCalled();
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(ResourceSessionStartedEvent.EVENT_NAME, expect.any(Object));

      const emitted = eventEmitter.emitAsync.mock.calls.find((c) => c[0] === ResourceSessionStartedEvent.EVENT_NAME);
      const eventPayload = emitted?.[1] as ResourceSessionStartedEvent;
      expect(eventPayload).toBeInstanceOf(ResourceSessionStartedEvent);
      expect(eventPayload.usage).toMatchObject({ id: 1, userId: 1, endNotes: 'Session completed' });
    });

    it("emits a resource session ended notification event after ending someone else's session", async () => {
      const dto: EndUsageSessionDto = { notes: 'Manager stop' };
      const sessionOwner = { id: 77, username: 'member' } as User;
      const managerUser = {
        id: 88,
        username: 'manager',
      } as User;
      mockRbacService.getEffectivePermissions.mockResolvedValue(new Set(['resources.update']));
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

      resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession)
        .mockResolvedValueOnce(mockUpdatedSession)
        .mockResolvedValueOnce(mockUpdatedSession);

      const mockUpdateQueryBuilder = createMockQueryBuilder(null);
      (transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      await service.endSession(mockActiveSession.resourceId, managerUser, dto);

      const endedEmit = eventEmitter.emit.mock.calls.find((c) => c[0] === ResourceUsageSessionEndedEvent.EVENT_NAME);
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

      resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession)
        .mockResolvedValueOnce(mockUpdatedSession)
        .mockResolvedValueOnce(mockUpdatedSession);

      const mockUpdateQueryBuilder = createMockQueryBuilder(null);
      (transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      await service.endSession(
        mockActiveSession.resourceId,
        owner,
        { notes: 'Flow stop' },
        { skipFormSubmissions: true, skipNoteNotification: true },
      );

      const endedEmit = eventEmitter.emit.mock.calls.find((c) => c[0] === ResourceUsageSessionEndedEvent.EVENT_NAME);
      expect(endedEmit).toBeDefined();
      const payload = endedEmit?.[1] as ResourceUsageSessionEndedEvent;
      expect(payload.usage).toBe(mockUpdatedSession);
      expect(payload.endedBy).toBeNull();
    });

    const setupEndSession = () => {
      const mockActiveSession = {
        id: 1,
        resourceId: 1,
        userId: 1,
        startTime: new Date(),
        user: { id: 1, username: 'owner' } as User,
      } as ResourceUsage;
      const mockUpdatedSession = { ...mockActiveSession, endTime: new Date(), endNotes: 'note text' };
      resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession)
        .mockResolvedValueOnce(mockUpdatedSession)
        .mockResolvedValueOnce(mockUpdatedSession);
      const mockUpdateQueryBuilder = createMockQueryBuilder(null);
      (mockUpdateQueryBuilder.update as jest.Mock).mockReturnValue(mockUpdateQueryBuilder);
      resourceUsageRepository.createQueryBuilder.mockReturnValue(
        mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );
    };

    it('emits ResourceUsageNoteAddedEvent when a user note is present', async () => {
      setupEndSession();

      await service.endSession(1, mockUser, { notes: 'note text' });

      const noteEmit = eventEmitter.emit.mock.calls.find((c) => c[0] === ResourceUsageNoteAddedEvent.EVENT_NAME);
      expect(noteEmit).toBeDefined();
      const payload = noteEmit?.[1] as ResourceUsageNoteAddedEvent;
      expect(payload).toMatchObject({ resourceId: 1, note: 'note text', phase: 'end' });
    });

    it('does not emit the note event when skipNoteNotification is set (flow-ended session)', async () => {
      setupEndSession();

      await service.endSession(1, mockUser, { notes: 'auto note' }, { skipNoteNotification: true });

      const noteEmit = eventEmitter.emit.mock.calls.find((c) => c[0] === ResourceUsageNoteAddedEvent.EVENT_NAME);
      expect(noteEmit).toBeUndefined();
    });

    it('should throw error when no active session exists', async () => {
      const dto: EndUsageSessionDto = { notes: 'Session completed' };

      // Mock getActiveSession to return null (no active session)
      resourceUsageRepository.findOne.mockResolvedValue(null);

      await expect(service.endSession(1, mockUser, dto)).rejects.toThrow(
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

      (resourceUsageRepository.manager.transaction as jest.Mock).mockImplementationOnce(async (cb) => {
        transactionStarted = true;
        return cb(transactionalEntityManager);
      });
      resourceUsageRepository.findOne.mockImplementation(async () => {
        expect(transactionStarted).toBe(true);
        return resourceUsageRepository.findOne.mock.calls.length === 1 ? mockActiveSession : mockUpdatedSession;
      });

      await service.endSession(mockActiveSession.resourceId, sessionOwner, dto);

      expect(flowExecutorService.runFlow).toHaveBeenCalledTimes(1);
      expect(billingService.chargeForResourceUsage).toHaveBeenCalledTimes(1);
    });

    it('allows users with resources.update permission to end sessions owned by others', async () => {
      const dto: EndUsageSessionDto = { notes: 'Manual stop' };
      const sessionOwner = { id: 77, username: 'member' } as User;
      const managerUser = {
        id: 88,
        username: 'manager',
      } as User;
      mockRbacService.getEffectivePermissions.mockResolvedValue(new Set(['resources.update']));
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

      resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession)
        .mockResolvedValueOnce(mockUpdatedSession)
        .mockResolvedValueOnce(mockUpdatedSession);

      const mockUpdateQueryBuilder = createMockQueryBuilder(null);
      (transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      const result = await service.endSession(mockActiveSession.resourceId, managerUser, dto);

      expect(result).toBe(mockUpdatedSession);
      expect(resourceIntroducersService.canMaintain).not.toHaveBeenCalled();
      expect(mockUpdateQueryBuilder.update).toHaveBeenCalledWith(ResourceUsage);
      expect(billingService.chargeForResourceUsage).toHaveBeenCalledWith(mockUpdatedSession, expect.anything());
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(ResourceSessionStartedEvent.EVENT_NAME, expect.any(Object));
      expect(flowExecutorService.runFlow).toHaveBeenCalledWith(
        mockActiveSession.resourceId,
        ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
        expect.objectContaining({ endNotes: prefixedNotes }),
        expect.anything(),
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

      resourceIntroducersService.canMaintain.mockResolvedValue(true);
      resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession)
        .mockResolvedValueOnce(mockUpdatedSession)
        .mockResolvedValueOnce(mockUpdatedSession);

      const mockUpdateQueryBuilder = createMockQueryBuilder(null);
      (transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      const result = await service.endSession(mockActiveSession.resourceId, introducerUser, dto);

      expect(result).toBe(mockUpdatedSession);
      expect(resourceIntroducersService.canMaintain).toHaveBeenCalledWith(
        mockActiveSession.resourceId,
        introducerUser.id,
        true,
      );
      expect(flowExecutorService.runFlow).toHaveBeenCalledWith(
        mockActiveSession.resourceId,
        ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
        expect.objectContaining({ endNotes: prefixedNotes }),
        expect.anything(),
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

      resourceIntroducersService.canMaintain.mockImplementation(async (_resId, _userId, includeGroupIntroducers) =>
        includeGroupIntroducers ? true : false,
      );
      resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession)
        .mockResolvedValueOnce(mockUpdatedSession)
        .mockResolvedValueOnce(mockUpdatedSession);

      const mockUpdateQueryBuilder = createMockQueryBuilder(null);
      (transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      const result = await service.endSession(mockActiveSession.resourceId, groupIntroducer, dto);

      expect(result).toBe(mockUpdatedSession);
      expect(resourceIntroducersService.canMaintain).toHaveBeenCalledWith(
        mockActiveSession.resourceId,
        groupIntroducer.id,
        true,
      );
      await expect(resourceIntroducersService.canMaintain.mock.results.at(-1)?.value).resolves.toBe(true);
      expect(flowExecutorService.runFlow).toHaveBeenCalledWith(
        mockActiveSession.resourceId,
        ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
        expect.objectContaining({ endNotes: prefixedNotes }),
        expect.anything(),
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

      resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession)
        .mockResolvedValueOnce(mockUpdatedSession)
        .mockResolvedValueOnce(mockUpdatedSession);

      const mockUpdateQueryBuilder = createMockQueryBuilder(null);
      (transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      const result = await service.endSession(mockActiveSession.resourceId, supervisorUser, dto);

      expect(result).toBe(mockUpdatedSession);
      // The supervisor short-circuits the authorization check; no introducer lookup needed.
      expect(resourceIntroducersService.canMaintain).not.toHaveBeenCalled();
      expect(flowExecutorService.runFlow).toHaveBeenCalledWith(
        mockActiveSession.resourceId,
        ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
        expect.objectContaining({ endNotes: prefixedNotes }),
        expect.anything(),
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

      resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession)
        .mockResolvedValueOnce(mockUpdatedSession)
        .mockResolvedValueOnce(mockUpdatedSession);

      (transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        createMockQueryBuilder(null) as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      await service.endSession(mockActiveSession.resourceId, supervisorUser, dto);

      const endedEmit = eventEmitter.emit.mock.calls.find((c) => c[0] === ResourceSupervisedUsageEndedEvent.EVENT_NAME);
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

      resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession)
        .mockResolvedValueOnce(mockUpdatedSession)
        .mockResolvedValueOnce(mockUpdatedSession);

      (transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        createMockQueryBuilder(null) as unknown as SelectQueryBuilder<ResourceUsage>,
      );

      await service.endSession(mockActiveSession.resourceId, sessionOwner, dto);

      const endedEmit = eventEmitter.emit.mock.calls.find((c) => c[0] === ResourceSupervisedUsageEndedEvent.EVENT_NAME);
      expect(endedEmit).toBeUndefined();
    });
  });

  describe('door actions', () => {
    const mockUser: User = { id: 5 } as User;
    const doorResource: Resource = {
      id: 10,
      name: 'Front Door',
      type: ResourceType.Door,
      allowTakeOver: false,
      separateUnlockAndUnlatch: false,
    } as Resource;

    beforeEach(() => {
      // Common permission/maintenance happy-path mocks
      resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);
    });

    it('should lock a door and emit event', async () => {
      resourceRepository.findOne.mockResolvedValue(doorResource);
      const saved = {
        id: 100,
        resourceId: 10,
        userId: 5,
        usageAction: ResourceUsageAction.DoorLock,
        startTime: new Date(),
        startNotes: null,
        endTime: new Date(),
        endNotes: null,
      } as unknown as ResourceUsage;
      resourceUsageRepository.save.mockResolvedValue(saved);
      resourceUsageRepository.findOne.mockResolvedValue(saved);

      const result = await service.lockDoor(10, mockUser);

      expect(result).toBe(saved);
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(ResourceSessionStartedEvent.EVENT_NAME, expect.any(Object));

      const emitted = eventEmitter.emitAsync.mock.calls[0];
      const payload = emitted[1] as ResourceSessionStartedEvent;
      expect(payload).toBeInstanceOf(ResourceSessionStartedEvent);
      expect(payload.usage).toMatchObject({
        id: 100,
        usageAction: ResourceUsageAction.DoorLock,
        resourceId: 10,
        userId: 5,
      });
    });

    it('should unlock a door and emit event', async () => {
      resourceRepository.findOne.mockResolvedValue(doorResource);
      const saved = {
        id: 101,
        resourceId: 10,
        userId: 5,
        usageAction: ResourceUsageAction.DoorUnlock,
        startTime: new Date(),
        startNotes: null,
        endTime: new Date(),
        endNotes: null,
      } as unknown as ResourceUsage;
      resourceUsageRepository.save.mockResolvedValue(saved);
      resourceUsageRepository.findOne.mockResolvedValue(saved);

      const result = await service.unlockDoor(10, mockUser);

      expect(result).toBe(saved);
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(ResourceSessionStartedEvent.EVENT_NAME, expect.any(Object));

      const emitted = eventEmitter.emitAsync.mock.calls[0];
      const payload = emitted[1] as ResourceSessionStartedEvent;
      expect(payload).toBeInstanceOf(ResourceSessionStartedEvent);
      expect(payload.usage).toMatchObject({
        id: 101,
        usageAction: ResourceUsageAction.DoorUnlock,
        resourceId: 10,
        userId: 5,
      });
    });

    it('should unlatch a door when supported and emit event', async () => {
      resourceRepository.findOne.mockResolvedValue({ ...doorResource, separateUnlockAndUnlatch: true } as Resource);
      const saved = {
        id: 102,
        resourceId: 10,
        userId: 5,
        usageAction: ResourceUsageAction.DoorUnlatch,
        startTime: new Date(),
        startNotes: null,
        endTime: new Date(),
        endNotes: null,
      } as unknown as ResourceUsage;
      resourceUsageRepository.save.mockResolvedValue(saved);
      resourceUsageRepository.findOne.mockResolvedValue(saved);

      const result = await service.unlatchDoor(10, mockUser);

      expect(result).toBe(saved);
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(ResourceSessionStartedEvent.EVENT_NAME, expect.any(Object));

      const emitted = eventEmitter.emitAsync.mock.calls[0];
      const payload = emitted[1] as ResourceSessionStartedEvent;
      expect(payload).toBeInstanceOf(ResourceSessionStartedEvent);
      expect(payload.usage).toMatchObject({
        id: 102,
        usageAction: ResourceUsageAction.DoorUnlatch,
        resourceId: 10,
        userId: 5,
      });
    });

    it('should propagate emitAsync errors from door lock', async () => {
      resourceRepository.findOne.mockResolvedValue(doorResource);
      const saved = {
        id: 100,
        resourceId: 10,
        userId: 5,
        usageAction: ResourceUsageAction.DoorLock,
        startTime: new Date(),
        endTime: new Date(),
      } as unknown as ResourceUsage;
      resourceUsageRepository.save.mockResolvedValue(saved);
      resourceUsageRepository.findOne.mockResolvedValue(saved);
      eventEmitter.emitAsync.mockRejectedValueOnce(new Error('Flow error'));

      await expect(service.lockDoor(10, mockUser)).rejects.toThrow('Flow error');
    });

    it('should propagate emitAsync errors from door unlock', async () => {
      resourceRepository.findOne.mockResolvedValue(doorResource);
      const saved = {
        id: 101,
        resourceId: 10,
        userId: 5,
        usageAction: ResourceUsageAction.DoorUnlock,
        startTime: new Date(),
        endTime: new Date(),
      } as unknown as ResourceUsage;
      resourceUsageRepository.save.mockResolvedValue(saved);
      resourceUsageRepository.findOne.mockResolvedValue(saved);
      eventEmitter.emitAsync.mockRejectedValueOnce(new Error('Flow error'));

      await expect(service.unlockDoor(10, mockUser)).rejects.toThrow('Flow error');
    });

    it('should propagate emitAsync errors from door unlatch', async () => {
      resourceRepository.findOne.mockResolvedValue({ ...doorResource, separateUnlockAndUnlatch: true } as Resource);
      const saved = {
        id: 102,
        resourceId: 10,
        userId: 5,
        usageAction: ResourceUsageAction.DoorUnlatch,
        startTime: new Date(),
        endTime: new Date(),
      } as unknown as ResourceUsage;
      resourceUsageRepository.save.mockResolvedValue(saved);
      resourceUsageRepository.findOne.mockResolvedValue(saved);
      eventEmitter.emitAsync.mockRejectedValueOnce(new Error('Flow error'));

      await expect(service.unlatchDoor(10, mockUser)).rejects.toThrow('Flow error');
    });

    it('should throw when operating non-door resource', async () => {
      resourceRepository.findOne.mockResolvedValue({ ...doorResource, type: ResourceType.Machine } as Resource);

      await expect(service.lockDoor(10, mockUser)).rejects.toThrow('Resource is not a door');
      await expect(service.unlockDoor(10, mockUser)).rejects.toThrow('Resource is not a door');
    });

    it('should throw when unlatching unsupported door', async () => {
      resourceRepository.findOne.mockResolvedValue({ ...doorResource, separateUnlockAndUnlatch: false } as Resource);

      await expect(service.unlatchDoor(10, mockUser)).rejects.toThrow(
        'Door (ID: 10, Name: Front Door) does not support unlatching',
      );
    });
  });
});
