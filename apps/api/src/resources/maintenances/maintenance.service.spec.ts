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
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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

});
