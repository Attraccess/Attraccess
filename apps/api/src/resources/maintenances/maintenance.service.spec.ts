import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ResourceMaintenanceService } from './maintenance.service';
import { ResourceMaintenance, Resource, ResourceIntroducer } from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MetricsService } from '../../metrics/metrics.service';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';

const mockMetricsService = {
  resourceMaintenanceTotal: { inc: jest.fn() },
  resourceMaintenanceOverdue: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
};

// Mock the database entities to avoid import issues
const mockResource = {
  id: 1,
  name: 'Test Resource',
};

const mockMaintenance = {
  id: 1,
  startTime: new Date('2025-01-01T10:00:00.000Z'),
  endTime: null,
  reason: 'Test maintenance',
  resource: mockResource,
};

describe('MaintenanceService', () => {
  let service: ResourceMaintenanceService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let maintenanceRepository: Repository<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let resourceRepository: Repository<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let resourceIntroducerRepository: Repository<any>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceMaintenanceService,
        {
          provide: getRepositoryToken(ResourceMaintenance),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              leftJoinAndSelect: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              skip: jest.fn().mockReturnThis(),
              take: jest.fn().mockReturnThis(),
              getCount: jest.fn(),
              getMany: jest.fn(),
            })),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Resource),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ResourceIntroducer),
          useValue: {
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
        {
          provide: RbacService,
          useValue: { getEffectivePermissions: jest.fn().mockResolvedValue(new Set()) },
        },
      ],
    }).compile();

    service = module.get<ResourceMaintenanceService>(ResourceMaintenanceService);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    maintenanceRepository = module.get<Repository<any>>(getRepositoryToken(ResourceMaintenance));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resourceRepository = module.get<Repository<any>>(getRepositoryToken(Resource));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resourceIntroducerRepository = module.get<Repository<any>>(getRepositoryToken(ResourceIntroducer));
  });

  it('creates scheduled maintenance with deferred notifications in a transaction', async () => {
    jest.spyOn(resourceRepository, 'findOne').mockResolvedValue(mockResource);
    jest.spyOn(maintenanceRepository, 'create').mockReturnValue(mockMaintenance);
    jest.spyOn(maintenanceRepository, 'save').mockResolvedValue(mockMaintenance);
    const manager = {
      getRepository: (entity: unknown) => (entity === Resource ? resourceRepository : maintenanceRepository),
    };
    const emit = jest.spyOn(service, 'emitScheduledMaintenanceCreated');
    expect(await service.createMaintenanceFromSchedule(1, 8, 'Due', manager as never, false)).toBe(mockMaintenance);
    expect(maintenanceRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ maintenanceSchedule: { id: 8 }, endTime: null, reason: 'Due' }),
    );
    expect(emit).not.toHaveBeenCalled();
    await service.createMaintenanceFromSchedule(1, 8, 'Due');
    expect(emit).toHaveBeenCalledWith(1, 1);
    jest.spyOn(resourceRepository, 'findOne').mockResolvedValue(null);
    await expect(service.createMaintenanceFromSchedule(99, 8, 'Due')).rejects.toThrow('not found');
  });

  it('checks active maintenance by resource or schedule through the supplied transaction', async () => {
    const query = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(mockMaintenance),
    };
    jest.spyOn(maintenanceRepository, 'createQueryBuilder').mockReturnValue(query as never);
    expect(await service.hasActiveMaintenance(1)).toBe(true);
    expect(query.where).toHaveBeenCalledWith('maintenance.resourceId = :resourceId', { resourceId: 1 });
    query.getOne.mockResolvedValue(null);
    const manager = { getRepository: () => maintenanceRepository };
    expect(await service.hasActiveMaintenance({ resourceId: 1, scheduleId: 8 }, manager as never)).toBe(false);
    expect(query.andWhere).toHaveBeenCalledWith('maintenance.maintenanceScheduleId = :scheduleId', { scheduleId: 8 });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('maintenance listing', () => {
    it.each([
      [true, false, false, 'maintenance.startTime > :now'],
      [false, true, false, 'maintenance.endTime IS NULL'],
      [false, false, true, 'maintenance.endTime < :now'],
      [true, true, true, null],
    ])(
      'filters upcoming=%s active=%s past=%s before pagination',
      async (includeUpcoming, includeActive, includePast, condition) => {
        jest.spyOn(resourceRepository, 'findOne').mockResolvedValue(mockResource);
        const query = maintenanceRepository.createQueryBuilder();
        jest.spyOn(maintenanceRepository, 'createQueryBuilder').mockReturnValue(query);
        jest.spyOn(query, 'getCount').mockResolvedValue(11);
        jest.spyOn(query, 'getMany').mockResolvedValue([mockMaintenance]);
        expect(
          await service.findMaintenances(1, { page: 2, limit: 5, includeUpcoming, includeActive, includePast }),
        ).toEqual({ data: [mockMaintenance], total: 11, page: 2, limit: 5 });
        expect(query.where).toHaveBeenCalledWith('maintenance.resourceId = :resourceId', { resourceId: 1 });
        if (condition)
          expect(query.andWhere).toHaveBeenCalledWith(expect.stringContaining(condition), { now: expect.any(Date) });
        else expect(query.andWhere).not.toHaveBeenCalled();
        expect(query.skip).toHaveBeenCalledWith(5);
        expect(query.take).toHaveBeenCalledWith(5);
        expect(query.leftJoinAndSelect).toHaveBeenCalledWith('maintenance.completedByUser', 'completedByUser');
      },
    );

    it('rejects missing resources and an empty filter selection', async () => {
      jest.spyOn(resourceRepository, 'findOne').mockResolvedValue(null);
      await expect(service.findMaintenances(99)).rejects.toBeInstanceOf(NotFoundException);
      jest.spyOn(resourceRepository, 'findOne').mockResolvedValue(mockResource);
      await expect(
        service.findMaintenances(1, { includeUpcoming: false, includeActive: false, includePast: false }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('individual maintenance access', () => {
    it('accepts global and direct permissions without needing resource groups', async () => {
      const user = { id: 7, effectivePermissions: new Set(['resources.maintenance.manage']) } as Parameters<
        typeof service.canManageMaintenance
      >[0];
      expect(await service.canManageMaintenance(user, 1)).toBe(true);
      expect(resourceIntroducerRepository.findOne).not.toHaveBeenCalled();
      jest.spyOn(resourceIntroducerRepository, 'findOne').mockResolvedValue({ id: 2 });
      expect(await service.canManageMaintenance({ ...user, effectivePermissions: new Set() }, 1)).toBe(true);
      expect(resourceRepository.findOne).not.toHaveBeenCalled();
    });

    it('checks resource group introductions and denies missing or failed lookups', async () => {
      const user = { id: 7 } as Parameters<typeof service.canManageMaintenance>[0];
      jest.spyOn(resourceIntroducerRepository, 'findOne').mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 4 });
      jest.spyOn(resourceRepository, 'findOne').mockResolvedValue({ ...mockResource, groups: [{ id: 3 }] });
      expect(await service.canManageMaintenance(user, 1)).toBe(true);
      expect(resourceIntroducerRepository.findOne).toHaveBeenLastCalledWith({
        where: { user: { id: 7 }, resourceGroup: { id: expect.objectContaining({ _value: [3] }) } },
      });
      jest.spyOn(resourceIntroducerRepository, 'findOne').mockResolvedValue(null);
      expect(await service.canManageMaintenance(user, 1)).toBe(false);
      jest.spyOn(resourceRepository, 'findOne').mockResolvedValue(null);
      expect(await service.canManageMaintenance(user, 1)).toBe(false);
      jest.spyOn(resourceIntroducerRepository, 'findOne').mockRejectedValue(new Error('Database unavailable'));
      expect(await service.canManageMaintenance(user, 1)).toBe(false);
    });
  });

  describe('createMaintenance', () => {
    it('should create a maintenance successfully', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1); // Tomorrow

      const dto = {
        startTime: futureDate.toISOString(),
        reason: 'Test maintenance',
      };

      jest.spyOn(resourceRepository, 'findOne').mockResolvedValue(mockResource);
      jest.spyOn(maintenanceRepository, 'create').mockReturnValue(mockMaintenance);
      jest.spyOn(maintenanceRepository, 'save').mockResolvedValue(mockMaintenance);

      const result = await service.createMaintenance(1, dto);

      expect(result).toEqual(mockMaintenance);
      expect(resourceRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('should throw error if resource not found', async () => {
      const dto = {
        startTime: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      };

      jest.spyOn(resourceRepository, 'findOne').mockResolvedValue(null);

      await expect(service.createMaintenance(999, dto)).rejects.toThrow(
        new NotFoundException('Resource with ID 999 not found'),
      );
    });

    it('should create maintenance with past start time', async () => {
      const dto = {
        startTime: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        reason: 'Test maintenance with past start time',
      };

      jest.spyOn(resourceRepository, 'findOne').mockResolvedValue(mockResource);
      jest.spyOn(maintenanceRepository, 'create').mockReturnValue(mockMaintenance);
      jest.spyOn(maintenanceRepository, 'save').mockResolvedValue(mockMaintenance);

      const result = await service.createMaintenance(1, dto);

      expect(result).toEqual(mockMaintenance);
      expect(resourceRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    });
  });

  describe('finishMaintenance', () => {
    it('should finish a maintenance successfully', async () => {
      const maintenance = { ...mockMaintenance, endTime: null };
      const finishedMaintenance = { ...maintenance, endTime: new Date() };

      jest.spyOn(maintenanceRepository, 'findOne').mockResolvedValue(maintenance);
      jest.spyOn(maintenanceRepository, 'save').mockResolvedValue(finishedMaintenance);

      const result = await service.finishMaintenance(1);

      expect(result.endTime).toBeDefined();
      expect(maintenanceRepository.save).toHaveBeenCalled();
    });

    it('should throw error if maintenance not found', async () => {
      jest.spyOn(maintenanceRepository, 'findOne').mockResolvedValue(null);

      await expect(service.finishMaintenance(999)).rejects.toThrow(
        new NotFoundException('Maintenance with ID 999 not found'),
      );
    });

    it('should throw error if maintenance already finished', async () => {
      const finishedMaintenance = { ...mockMaintenance, endTime: new Date() };

      jest.spyOn(maintenanceRepository, 'findOne').mockResolvedValue(finishedMaintenance);

      await expect(service.finishMaintenance(1)).rejects.toThrow(
        new BadRequestException('Maintenance is already finished'),
      );
    });
  });

  describe('getMaintenanceManagedResourceIds', () => {
    it('returns all requested resources for global maintenance permission without role queries', async () => {
      await expect(
        service.getMaintenanceManagedResourceIds(
          { id: 7 } as never,
          [10, 20],
          new Set(['resources.maintenance.manage']),
        ),
      ).resolves.toEqual(new Set([10, 20]));
      expect(resourceIntroducerRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('batches direct and group maintenance roles for a resource list', async () => {
      const query = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { resourceId: 10, groupResourceId: null },
          { resourceId: null, groupResourceId: 20 },
        ]),
      };
      jest.spyOn(resourceIntroducerRepository, 'createQueryBuilder').mockReturnValue(query as never);

      await expect(service.getMaintenanceManagedResourceIds({ id: 7 } as never, [10, 20, 30])).resolves.toEqual(
        new Set([10, 20]),
      );

      expect(resourceIntroducerRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(query.andWhere).toHaveBeenCalledWith(
        '(resource.id IN (:...resourceIds) OR groupResource.id IN (:...resourceIds))',
        { resourceIds: [10, 20, 30] },
      );
    });
  });
});
