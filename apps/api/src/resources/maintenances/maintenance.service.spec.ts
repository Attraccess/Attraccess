import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ResourceMaintenanceService } from './maintenance.service';
import { ResourceMaintenance, Resource, ResourceIntroducer } from '@attraccess/database-entities';

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
        new NotFoundException('Resource with ID 999 not found')
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
        new NotFoundException('Maintenance with ID 999 not found')
      );
    });

    it('should throw error if maintenance already finished', async () => {
      const finishedMaintenance = { ...mockMaintenance, endTime: new Date() };

      jest.spyOn(maintenanceRepository, 'findOne').mockResolvedValue(finishedMaintenance);

      await expect(service.finishMaintenance(1)).rejects.toThrow(
        new BadRequestException('Maintenance is already finished')
      );
    });
  });

  describe('cancelMaintenance', () => {
    it('should cancel a maintenance successfully', async () => {
      jest.spyOn(maintenanceRepository, 'findOne').mockResolvedValue(mockMaintenance);
      jest.spyOn(maintenanceRepository, 'remove').mockResolvedValue(mockMaintenance);

      await service.cancelMaintenance(1);

      expect(maintenanceRepository.remove).toHaveBeenCalledWith(mockMaintenance);
    });

    it('should throw error if maintenance not found', async () => {
      jest.spyOn(maintenanceRepository, 'findOne').mockResolvedValue(null);

      await expect(service.cancelMaintenance(999)).rejects.toThrow(
        new NotFoundException('Maintenance with ID 999 not found')
      );
    });
  });

  describe('updateMaintenance', () => {
    it('should update a maintenance successfully', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1); // Tomorrow

      const dto = {
        startTime: futureDate.toISOString(),
        reason: 'Updated maintenance reason',
      };

      const updatedMaintenance = { ...mockMaintenance, ...dto };

      jest.spyOn(maintenanceRepository, 'findOne').mockResolvedValue(mockMaintenance);
      jest.spyOn(maintenanceRepository, 'save').mockResolvedValue(updatedMaintenance);

      const result = await service.updateMaintenance(1, dto);

      expect(result).toEqual(updatedMaintenance);
      expect(maintenanceRepository.save).toHaveBeenCalled();
    });

    it('should update only provided fields', async () => {
      const dto = {
        reason: 'Only updating reason',
      };

      const updatedMaintenance = { ...mockMaintenance, reason: dto.reason };

      jest.spyOn(maintenanceRepository, 'findOne').mockResolvedValue(mockMaintenance);
      jest.spyOn(maintenanceRepository, 'save').mockResolvedValue(updatedMaintenance);

      const result = await service.updateMaintenance(1, dto);

      expect(result.reason).toBe(dto.reason);
      expect(result.startTime).toBe(mockMaintenance.startTime); // Should remain unchanged
    });

    it('should throw error if maintenance not found', async () => {
      const dto = { reason: 'Test' };

      jest.spyOn(maintenanceRepository, 'findOne').mockResolvedValue(null);

      await expect(service.updateMaintenance(999, dto)).rejects.toThrow(
        new NotFoundException('Maintenance with ID 999 not found')
      );
    });

    it('should throw error if end time is before start time', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1); // Tomorrow

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1); // Yesterday

      const dto = {
        startTime: futureDate.toISOString(),
        endTime: pastDate.toISOString(),
      };

      jest.spyOn(maintenanceRepository, 'findOne').mockResolvedValue(mockMaintenance);

      await expect(service.updateMaintenance(1, dto)).rejects.toThrow(
        new BadRequestException('End time must be after start time')
      );
    });

    it('should allow setting end time to null', async () => {
      const dto = {
        endTime: null,
      };

      const updatedMaintenance = { ...mockMaintenance, endTime: null };

      jest.spyOn(maintenanceRepository, 'findOne').mockResolvedValue(mockMaintenance);
      jest.spyOn(maintenanceRepository, 'save').mockResolvedValue(updatedMaintenance);

      const result = await service.updateMaintenance(1, dto);

      expect(result.endTime).toBeNull();
    });
  });
});
