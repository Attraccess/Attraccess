import { Test, TestingModule } from '@nestjs/testing';
import { ResourceUsageService } from './resourceUsage.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Resource, ResourceUsage, ResourceType, ResourceUsageAction, User } from '@attraccess/database-entities';
import { Repository, IsNull, SelectQueryBuilder } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException } from '@nestjs/common';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { EndUsageSessionDto } from './dtos/endUsageSession.dto';
import { ResourcesService } from '../resources.service';
import { ResourceIntroductionsService } from '../introductions/resouceIntroductions.service';
import { ResourceIntroducersService } from '../introducers/resourceIntroducers.service';
import { ResourceGroupsIntroductionsService } from '../groups/introductions/resourceGroups.introductions.service';
import { ResourceGroupsIntroducersService } from '../groups/introducers/resourceGroups.introducers.service';
import { ResourceGroupsService } from '../groups/resourceGroups.service';
import { ResourceMaintenanceService } from '../maintenances/maintenance.service';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';
import { ResourceUsageImpossibleMaintenanceInProgressException } from '../../exceptions/resource.maintenance.inUse.exception';
import { ResourceUsageEvent, ResourceUsageTakenOverEvent } from './events/resource-usage.events';

describe('ResourceUsageService', () => {
  let service: ResourceUsageService;
  let resourceUsageRepository: jest.Mocked<Repository<ResourceUsage>>;
  let resourceRepository: jest.Mocked<Repository<Resource>>;
  let resourceIntroductionService: jest.Mocked<ResourceIntroductionsService>;
  let resourceIntroducersService: jest.Mocked<ResourceIntroducersService>;
  let resourceGroupsIntroductionsService: jest.Mocked<ResourceGroupsIntroductionsService>;
  let resourceGroupsIntroducersService: jest.Mocked<ResourceGroupsIntroducersService>;
  let resourceGroupsService: jest.Mocked<ResourceGroupsService>;
  let resourceMaintenanceService: jest.Mocked<ResourceMaintenanceService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

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

  const mockResourceMaintenanceService = {
    hasActiveMaintenance: jest.fn(),
    canManageMaintenance: jest.fn(),
  };

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
          provide: ResourceMaintenanceService,
          useValue: mockResourceMaintenanceService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<ResourceUsageService>(ResourceUsageService);
    resourceRepository = module.get(getRepositoryToken(Resource));
    resourceUsageRepository = module.get(getRepositoryToken(ResourceUsage));
    resourceIntroductionService = module.get(ResourceIntroductionsService);
    resourceIntroducersService = module.get(ResourceIntroducersService);
    resourceGroupsIntroductionsService = module.get(ResourceGroupsIntroductionsService);
    resourceGroupsIntroducersService = module.get(ResourceGroupsIntroducersService);
    resourceGroupsService = module.get(ResourceGroupsService);
    resourceMaintenanceService = module.get(ResourceMaintenanceService);
    eventEmitter = module.get(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
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

      // Mock getActiveSession to return null (no active session)
      resourceUsageRepository.findOne
        .mockResolvedValueOnce(null) // For getActiveSession
        .mockResolvedValueOnce({
          id: 1,
          resourceId: 1,
          userId: 1,
          usageAction: ResourceUsageAction.Usage,
          endTime: null,
        } as ResourceUsage); // For finding new session

      const mockQueryBuilder = createMockQueryBuilder(null);
      resourceUsageRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>
      );

      const result = await service.startSession(1, mockUser, dto);

      expect(result).toMatchObject({
        id: 1,
        resourceId: 1,
        userId: 1,
        usageAction: ResourceUsageAction.Usage,
        endTime: null,
      });
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
      });
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(ResourceUsageEvent.EVENT_NAME, expect.any(Object));

      const emitted = eventEmitter.emit.mock.calls.find((c) => c[0] === ResourceUsageEvent.EVENT_NAME);
      expect(emitted).toBeDefined();
      const usageEvent = emitted?.[1] as ResourceUsageEvent;
      expect(usageEvent).toBeInstanceOf(ResourceUsageEvent);
      expect(usageEvent.usage).toMatchObject({
        resourceId: 1,
        userId: 1,
        usageAction: ResourceUsageAction.Usage,
        endTime: null,
      });
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
      expect(resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledWith(1, 1);
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

      await expect(service.startSession(1, mockUser, dto)).rejects.toThrow(
        new BadRequestException('Resource is currently in use by another user')
      );
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
        new BadRequestException('This resource does not allow overtaking')
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

      const mockActiveSession = { id: 1, userId: 2, startTime: new Date(), user: { id: 2 } as User } as ResourceUsage;
      const updatedEndedSession = {
        ...mockActiveSession,
        endTime: new Date(),
        endNotes: 'Session ended due to takeover by user 1',
      } as ResourceUsage;
      const mockNewUsage = { id: 2, resourceId: 1, userId: 1 } as ResourceUsage;

      // Mock getActiveSession to return an active session, then mock findOne for new session
      resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession) // 1) getActiveSession
        .mockResolvedValueOnce(updatedEndedSession) // 2) fetch updated ended session
        .mockResolvedValueOnce(mockNewUsage); // 3) fetch newly created session

      const mockUpdateQueryBuilder = createMockQueryBuilder(null);
      const mockInsertQueryBuilder = createMockQueryBuilder(null);

      resourceUsageRepository.createQueryBuilder
        .mockReturnValueOnce(mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>) // For ending session
        .mockReturnValueOnce(mockInsertQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>); // For creating new session

      const result = await service.startSession(1, mockUser, dto);

      expect(result).toBe(mockNewUsage);
      expect(mockUpdateQueryBuilder.update).toHaveBeenCalledWith(ResourceUsage);
      expect(mockUpdateQueryBuilder.set).toHaveBeenCalledWith({
        endTime: expect.any(Date),
        endNotes: 'Session ended due to takeover by user 1',
      });
      expect(mockUpdateQueryBuilder.where).toHaveBeenCalledWith('id = :id', { id: 1 });
      expect(mockInsertQueryBuilder.insert).toHaveBeenCalled();
      // One event for the ended previous session and one takeover event
      expect(eventEmitter.emit).toHaveBeenCalledWith(ResourceUsageEvent.EVENT_NAME, expect.any(Object));
      expect(eventEmitter.emit).toHaveBeenCalledWith(ResourceUsageTakenOverEvent.EVENT_NAME, expect.any(Object));

      const usageEmit = eventEmitter.emit.mock.calls.find((c) => c[0] === ResourceUsageEvent.EVENT_NAME);
      const usagePayload = usageEmit?.[1] as ResourceUsageEvent;
      expect(usagePayload).toBeInstanceOf(ResourceUsageEvent);
      expect(usagePayload.usage).toMatchObject({ id: 1, userId: 2, endNotes: expect.stringContaining('takeover') });

      const takeoverEmit = eventEmitter.emit.mock.calls.find((c) => c[0] === ResourceUsageTakenOverEvent.EVENT_NAME);
      const takeoverPayload = takeoverEmit?.[1] as ResourceUsageTakenOverEvent;
      expect(takeoverPayload).toBeInstanceOf(ResourceUsageTakenOverEvent);
      expect(takeoverPayload.resource).toMatchObject({
        id: mockResourceWithTakeOver.id,
        name: mockResourceWithTakeOver.name,
      });
      expect(takeoverPayload.newUser).toMatchObject({ id: mockUser.id });
      expect(takeoverPayload.previousUser).toMatchObject({ id: mockActiveSession.user?.id });
      expect(takeoverPayload.takeoverTime).toBeInstanceOf(Date);
    });

    it('should throw ResourceMaintenanceInUseException when resource is under maintenance and user cannot manage maintenance', async () => {
      const dto: StartUsageSessionDto = { notes: 'Test session' };

      // Mock resourceRepository.findOne to return the resource
      resourceRepository.findOne.mockResolvedValue(mockResource);

      // Mock maintenance service to indicate active maintenance
      resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(true);
      resourceMaintenanceService.canManageMaintenance.mockResolvedValue(false);

      await expect(service.startSession(1, mockUser, dto)).rejects.toThrow(
        ResourceUsageImpossibleMaintenanceInProgressException
      );
      expect(resourceMaintenanceService.hasActiveMaintenance).toHaveBeenCalledWith(1);
      expect(resourceMaintenanceService.canManageMaintenance).toHaveBeenCalledWith(mockUser, 1);
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

      // Mock getActiveSession to return null (no active session)
      resourceUsageRepository.findOne
        .mockResolvedValueOnce(null) // For getActiveSession
        .mockResolvedValueOnce({ id: 1, resourceId: 1, userId: 1 } as ResourceUsage); // For finding new session

      const mockQueryBuilder = createMockQueryBuilder(null);
      resourceUsageRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>
      );

      const result = await service.startSession(1, mockUser, dto);

      expect(result).toEqual({ id: 1, resourceId: 1, userId: 1 });
      expect(resourceMaintenanceService.hasActiveMaintenance).toHaveBeenCalledWith(1);
      expect(resourceMaintenanceService.canManageMaintenance).toHaveBeenCalledWith(mockUser, 1);
    });
  });

  describe('getActiveSession', () => {
    it('should return active session when it exists', async () => {
      const mockActiveSession = { id: 1, resourceId: 1, userId: 1, user: { id: 1 } as User } as ResourceUsage;
      resourceUsageRepository.findOne.mockResolvedValue(mockActiveSession);

      const result = await service.getActiveSession(1);

      expect(result).toBe(mockActiveSession);
      expect(resourceUsageRepository.findOne).toHaveBeenCalledWith({
        where: {
          resourceId: 1,
          endTime: IsNull(),
        },
        relations: ['user', 'resource'],
      });
    });

    it('should return null when no active session exists', async () => {
      resourceUsageRepository.findOne.mockResolvedValue(null);

      const result = await service.getActiveSession(1);

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

      // Mock getActiveSession to return an active session
      resourceUsageRepository.findOne
        .mockResolvedValueOnce(mockActiveSession) // For getActiveSession
        .mockResolvedValueOnce(mockUpdatedSession); // For finding updated session

      const mockUpdateQueryBuilder = createMockQueryBuilder(null);
      resourceUsageRepository.createQueryBuilder.mockReturnValue(
        mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>
      );

      const result = await service.endSession(1, mockUser, dto);

      expect(result).toBe(mockUpdatedSession);
      expect(mockUpdateQueryBuilder.update).toHaveBeenCalledWith(ResourceUsage);
      expect(mockUpdateQueryBuilder.set).toHaveBeenCalledWith({
        endTime: expect.any(Date),
        endNotes: 'Session completed',
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(ResourceUsageEvent.EVENT_NAME, expect.any(Object));

      const emitted = eventEmitter.emit.mock.calls.find((c) => c[0] === ResourceUsageEvent.EVENT_NAME);
      const eventPayload = emitted?.[1] as ResourceUsageEvent;
      expect(eventPayload).toBeInstanceOf(ResourceUsageEvent);
      expect(eventPayload.usage).toMatchObject({ id: 1, userId: 1, endNotes: 'Session completed' });
    });

    it('should throw error when no active session exists', async () => {
      const dto: EndUsageSessionDto = { notes: 'Session completed' };

      // Mock getActiveSession to return null (no active session)
      resourceUsageRepository.findOne.mockResolvedValue(null);

      await expect(service.endSession(1, mockUser, dto)).rejects.toThrow(
        new BadRequestException('No active session found')
      );
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
      expect(eventEmitter.emit).toHaveBeenCalledWith(ResourceUsageEvent.EVENT_NAME, expect.any(Object));

      const emitted = eventEmitter.emit.mock.calls[0];
      const payload = emitted[1] as ResourceUsageEvent;
      expect(payload).toBeInstanceOf(ResourceUsageEvent);
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
      expect(eventEmitter.emit).toHaveBeenCalledWith(ResourceUsageEvent.EVENT_NAME, expect.any(Object));

      const emitted = eventEmitter.emit.mock.calls[0];
      const payload = emitted[1] as ResourceUsageEvent;
      expect(payload).toBeInstanceOf(ResourceUsageEvent);
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
      expect(eventEmitter.emit).toHaveBeenCalledWith(ResourceUsageEvent.EVENT_NAME, expect.any(Object));

      const emitted = eventEmitter.emit.mock.calls[0];
      const payload = emitted[1] as ResourceUsageEvent;
      expect(payload).toBeInstanceOf(ResourceUsageEvent);
      expect(payload.usage).toMatchObject({
        id: 102,
        usageAction: ResourceUsageAction.DoorUnlatch,
        resourceId: 10,
        userId: 5,
      });
    });

    it('should throw when operating non-door resource', async () => {
      resourceRepository.findOne.mockResolvedValue({ ...doorResource, type: ResourceType.Machine } as Resource);

      await expect(service.lockDoor(10, mockUser)).rejects.toThrow('Resource is not a door');
      await expect(service.unlockDoor(10, mockUser)).rejects.toThrow('Resource is not a door');
    });

    it('should throw when unlatching unsupported door', async () => {
      resourceRepository.findOne.mockResolvedValue({ ...doorResource, separateUnlockAndUnlatch: false } as Resource);

      await expect(service.unlatchDoor(10, mockUser)).rejects.toThrow(
        'Door (ID: 10, Name: Front Door) does not support unlatching'
      );
    });
  });
});
