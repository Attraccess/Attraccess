import { MaintenanceRequestPersistence } from './persistence/port';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MaintenanceRequestService } from './maintenance-request.service';
import { ResourceMaintenanceService } from './maintenance.service';
import { ResourceMaintenanceRequestCreatedEvent } from './events/maintenance-request-created.event';
import { ResolveMaintenanceRequestAction } from './dtos/resolve-maintenance-request.dto';
import { MaintenanceRequestStatus, Resource, ResourceMaintenanceRequest } from '@attraccess/application-models';

const mockResource = { id: 1, name: 'Test Resource' } as Resource;

describe('MaintenanceRequestService', () => {
  let service: MaintenanceRequestService;
  let persistence: jest.Mocked<MaintenanceRequestPersistence>;
  let eventEmitter: EventEmitter2;
  let maintenanceService: { createMaintenance: jest.Mock };

  beforeEach(async () => {
    maintenanceService = { createMaintenance: jest.fn() };
    persistence = {
      resource: jest.fn(),
      createRequest: jest.fn(
        async (resource, userId, reason, status) =>
          ({
            id: 10,
            resourceId: resource.id,
            createdByUserId: userId,
            reason,
            status,
          }) as unknown as ResourceMaintenanceRequest,
      ),
      requestPage: jest.fn(),
      requestWithRelations: jest.fn(),
      saveRequest: jest.fn(async (request) => request),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceRequestService,
        { provide: MaintenanceRequestPersistence, useValue: persistence },
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
    eventEmitter = module.get(EventEmitter2);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createRequest', () => {
    it('creates an open request and emits an event', async () => {
      persistence.resource.mockResolvedValue(mockResource);

      const result = await service.createRequest(1, 7, 'It is broken');

      expect(result.status).toBe(MaintenanceRequestStatus.OPEN);
      expect(persistence.createRequest).toHaveBeenCalledWith(
        mockResource,
        7,
        'It is broken',
        MaintenanceRequestStatus.OPEN,
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        ResourceMaintenanceRequestCreatedEvent.EVENT_NAME,
        expect.objectContaining({ resourceId: 1, requestId: 10 }),
      );
    });

    it('throws when resource is missing', async () => {
      persistence.resource.mockResolvedValue(null);
      await expect(service.createRequest(999, 7, 'x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('resolveRequest', () => {
    it('dismisses an open request without creating a maintenance', async () => {
      persistence.requestWithRelations.mockResolvedValue({
        id: 5,
        resourceId: 1,
        reason: 'broken',
        status: MaintenanceRequestStatus.OPEN,
      } as unknown as ResourceMaintenanceRequest);

      const result = await service.resolveRequest(1, 5, 7, ResolveMaintenanceRequestAction.DISMISS);

      expect(maintenanceService.createMaintenance).not.toHaveBeenCalled();
      expect(result.status).toBe(MaintenanceRequestStatus.DISMISSED);
      expect(result.resolvedAt).toBeInstanceOf(Date);
    });

    it('converts an open request into an instant maintenance', async () => {
      persistence.requestWithRelations.mockResolvedValue({
        id: 5,
        resourceId: 1,
        reason: 'broken',
        status: MaintenanceRequestStatus.OPEN,
      } as unknown as ResourceMaintenanceRequest);
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
      persistence.requestWithRelations.mockResolvedValue({
        id: 5,
        resourceId: 2,
        status: MaintenanceRequestStatus.OPEN,
      } as unknown as ResourceMaintenanceRequest);
      await expect(service.resolveRequest(1, 5, 7, ResolveMaintenanceRequestAction.DISMISS)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws when the request is already resolved', async () => {
      persistence.requestWithRelations.mockResolvedValue({
        id: 5,
        resourceId: 1,
        status: MaintenanceRequestStatus.DISMISSED,
      } as unknown as ResourceMaintenanceRequest);
      await expect(service.resolveRequest(1, 5, 7, ResolveMaintenanceRequestAction.DISMISS)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
