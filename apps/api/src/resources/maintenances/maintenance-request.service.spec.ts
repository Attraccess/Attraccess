import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MaintenanceRequestService } from './maintenance-request.service';
import { ResourceMaintenanceService } from './maintenance.service';
import { ResourceMaintenanceRequestCreatedEvent } from './events/maintenance-request-created.event';
import { ResolveMaintenanceRequestAction } from './dtos/resolve-maintenance-request.dto';
import { MAINTENANCE_REQUEST_STORE, type MaintenanceRequestStore } from './maintenance-request-store.port';
import { MaintenanceRequestStatus, ResourceMaintenanceRequestRecord } from '@attraccess/application-models';

const requestRecord = (
  overrides: Partial<ResourceMaintenanceRequestRecord> = {},
): ResourceMaintenanceRequestRecord => ({
  id: 5,
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  resourceId: 1,
  reason: 'broken',
  status: MaintenanceRequestStatus.OPEN,
  resolvedAt: null,
  ...overrides,
});

describe('MaintenanceRequestService', () => {
  let service: MaintenanceRequestService;
  const store: { [K in keyof MaintenanceRequestStore]: jest.Mock } = {
    resourceExists: jest.fn(),
    create: jest.fn(),
    page: jest.fn(),
    findById: jest.fn(),
    resolve: jest.fn(),
  };
  const eventEmitter = { emit: jest.fn() };
  let maintenanceService: { createMaintenance: jest.Mock };

  beforeEach(async () => {
    jest.resetAllMocks();
    maintenanceService = { createMaintenance: jest.fn() };
    store.resourceExists.mockResolvedValue(true);
    store.resolve.mockImplementation(async (id, resolution) =>
      requestRecord({
        id,
        status: resolution.status,
        resolvedAt: resolution.resolvedAt,
        resultingMaintenance: resolution.resultingMaintenanceId
          ? ({ id: resolution.resultingMaintenanceId } as never)
          : undefined,
      }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceRequestService,
        { provide: MAINTENANCE_REQUEST_STORE, useValue: store },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: ResourceMaintenanceService, useValue: maintenanceService },
      ],
    }).compile();

    service = module.get(MaintenanceRequestService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createRequest', () => {
    it('creates an open request and emits an event', async () => {
      store.create.mockResolvedValue(requestRecord({ id: 10 }));

      const result = await service.createRequest(1, 7, 'It is broken');

      expect(result.status).toBe(MaintenanceRequestStatus.OPEN);
      expect(store.create).toHaveBeenCalledWith(1, 7, 'It is broken');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        ResourceMaintenanceRequestCreatedEvent.EVENT_NAME,
        expect.objectContaining({ resourceId: 1, requestId: 10 }),
      );
    });

    it('throws when resource is missing', async () => {
      store.resourceExists.mockResolvedValue(false);
      await expect(service.createRequest(999, 7, 'x')).rejects.toThrow(NotFoundException);
      expect(store.create).not.toHaveBeenCalled();
    });
  });

  describe('listRequests', () => {
    it('defaults to open requests on the first page', async () => {
      store.page.mockResolvedValue({ data: [requestRecord()], total: 1 });
      expect(await service.listRequests(1)).toEqual({ data: [requestRecord()], total: 1, page: 1, limit: 10 });
      expect(store.page).toHaveBeenCalledWith(1, MaintenanceRequestStatus.OPEN, 0, 10);
    });

    it('throws when resource is missing', async () => {
      store.resourceExists.mockResolvedValue(false);
      await expect(service.listRequests(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('resolveRequest', () => {
    it('dismisses an open request without creating a maintenance', async () => {
      store.findById.mockResolvedValue(requestRecord());

      const result = await service.resolveRequest(1, 5, 7, ResolveMaintenanceRequestAction.DISMISS);

      expect(maintenanceService.createMaintenance).not.toHaveBeenCalled();
      expect(result.status).toBe(MaintenanceRequestStatus.DISMISSED);
      expect(result.resolvedAt).toBeInstanceOf(Date);
      expect(store.resolve).toHaveBeenCalledWith(5, {
        status: MaintenanceRequestStatus.DISMISSED,
        resolvedByUserId: 7,
        resolvedAt: expect.any(Date),
        resultingMaintenanceId: undefined,
      });
    });

    it('converts an open request into an instant maintenance', async () => {
      store.findById.mockResolvedValue(requestRecord());
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
      store.findById.mockResolvedValue(requestRecord({ resourceId: 2 }));
      await expect(service.resolveRequest(1, 5, 7, ResolveMaintenanceRequestAction.DISMISS)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws when the request is already resolved', async () => {
      store.findById.mockResolvedValue(requestRecord({ status: MaintenanceRequestStatus.DISMISSED }));
      await expect(service.resolveRequest(1, 5, 7, ResolveMaintenanceRequestAction.DISMISS)).rejects.toThrow(
        BadRequestException,
      );
      expect(store.resolve).not.toHaveBeenCalled();
    });
  });
});
