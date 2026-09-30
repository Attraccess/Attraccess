import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MaintenanceRequestService } from './maintenance-request.service';
import { ResourceMaintenanceService } from './maintenance.service';
import { ResourceMaintenanceRequestCreatedEvent } from './events/maintenance-request-created.event';
import { ResolveMaintenanceRequestAction } from './dtos/resolve-maintenance-request.dto';
import { MaintenanceRequestStatus, Resource, ResourceMaintenanceRequest } from '@attraccess/database-entities';

const mockResource = { id: 1, name: 'Test Resource' };

describe('MaintenanceRequestService', () => {
  let service: MaintenanceRequestService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let requestRepository: Repository<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let resourceRepository: Repository<any>;
  let eventEmitter: EventEmitter2;
  let maintenanceService: { createMaintenance: jest.Mock };

  beforeEach(async () => {
    maintenanceService = { createMaintenance: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceRequestService,
        {
          provide: getRepositoryToken(ResourceMaintenanceRequest),
          useValue: {
            create: jest.fn((v) => v),
            save: jest.fn((v) => Promise.resolve({ id: 10, ...v })),
            findOne: jest.fn(),
            findAndCount: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Resource),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        {
          provide: ResourceMaintenanceService,
          useValue: maintenanceService,
        },
      ],
    }).compile();

    service = module.get(MaintenanceRequestService);
    requestRepository = module.get(getRepositoryToken(ResourceMaintenanceRequest));
    resourceRepository = module.get(getRepositoryToken(Resource));
    eventEmitter = module.get(EventEmitter2);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createRequest', () => {
    it('creates an open request and emits an event', async () => {
      jest.spyOn(resourceRepository, 'findOne').mockResolvedValue(mockResource);

      const result = await service.createRequest(1, 7, 'It is broken');

      expect(result.status).toBe(MaintenanceRequestStatus.OPEN);
      expect(requestRepository.save).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        ResourceMaintenanceRequestCreatedEvent.EVENT_NAME,
        expect.objectContaining({ resourceId: 1, requestId: 10 }),
      );
    });

    it('throws when resource is missing', async () => {
      jest.spyOn(resourceRepository, 'findOne').mockResolvedValue(null);
      await expect(service.createRequest(999, 7, 'x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('resolveRequest', () => {
    it('dismisses an open request without creating a maintenance', async () => {
      jest.spyOn(requestRepository, 'findOne').mockResolvedValue({
        id: 5,
        resourceId: 1,
        reason: 'broken',
        status: MaintenanceRequestStatus.OPEN,
      });

      const result = await service.resolveRequest(1, 5, 7, ResolveMaintenanceRequestAction.DISMISS);

      expect(maintenanceService.createMaintenance).not.toHaveBeenCalled();
      expect(result.status).toBe(MaintenanceRequestStatus.DISMISSED);
      expect(result.resolvedAt).toBeInstanceOf(Date);
    });

    it('converts an open request into an instant maintenance', async () => {
      jest.spyOn(requestRepository, 'findOne').mockResolvedValue({
        id: 5,
        resourceId: 1,
        reason: 'broken',
        status: MaintenanceRequestStatus.OPEN,
      });
      maintenanceService.createMaintenance.mockResolvedValue({ id: 99 });

      const result = await service.resolveRequest(1, 5, 7, ResolveMaintenanceRequestAction.CONVERT);

      expect(maintenanceService.createMaintenance).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ reason: 'broken' }),
        7,
      );
      expect(result.status).toBe(MaintenanceRequestStatus.RESOLVED);
      expect(result.resultingMaintenance).toEqual({ id: 99 });
    });

    it('throws when the request belongs to another resource', async () => {
      jest.spyOn(requestRepository, 'findOne').mockResolvedValue({
        id: 5,
        resourceId: 2,
        status: MaintenanceRequestStatus.OPEN,
      });
      await expect(service.resolveRequest(1, 5, 7, ResolveMaintenanceRequestAction.DISMISS)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws when the request is already resolved', async () => {
      jest.spyOn(requestRepository, 'findOne').mockResolvedValue({
        id: 5,
        resourceId: 1,
        status: MaintenanceRequestStatus.DISMISSED,
      });
      await expect(service.resolveRequest(1, 5, 7, ResolveMaintenanceRequestAction.DISMISS)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
