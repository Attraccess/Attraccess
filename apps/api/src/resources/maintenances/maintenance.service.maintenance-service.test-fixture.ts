import type { ResourceMaintenanceRecord } from '@attraccess/application-models';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from '../../metrics/metrics.service';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';
import { ResourceMaintenanceService } from './maintenance.service';
import { RESOURCE_MAINTENANCE_STORE, type ResourceMaintenanceStore } from './maintenance-store.port';

const mockMetricsService = {
  resourceMaintenanceTotal: { inc: jest.fn() },
  resourceMaintenanceOverdue: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
};

export const mockMaintenance: ResourceMaintenanceRecord = {
  id: 1,
  createdAt: new Date('2025-01-01T09:00:00.000Z'),
  updatedAt: new Date('2025-01-01T09:00:00.000Z'),
  resourceId: 1,
  startTime: new Date('2025-01-01T10:00:00.000Z'),
  endTime: null,
  reason: 'Test maintenance',
  completedAt: null,
};

export type MaintenanceStoreFake = { [K in keyof ResourceMaintenanceStore]: jest.Mock };

export function createMaintenanceStoreFake(): MaintenanceStoreFake {
  return {
    resourceExists: jest.fn().mockResolvedValue(true),
    page: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    findById: jest.fn().mockResolvedValue(null),
    findOverlapping: jest.fn().mockResolvedValue([]),
    hasActive: jest.fn().mockResolvedValue(false),
    activeResourceIds: jest.fn().mockResolvedValue(new Set()),
    introducerManagedResourceIds: jest.fn().mockResolvedValue(new Set()),
    lookupMaintenanceAccess: jest.fn().mockResolvedValue('none'),
    createManual: jest.fn().mockResolvedValue(mockMaintenance),
    createFromSchedule: jest.fn().mockResolvedValue(mockMaintenance),
    markFinished: jest.fn().mockResolvedValue(mockMaintenance),
  };
}

export function registerMaintenanceServiceFixture() {
  let service: ResourceMaintenanceService;
  let store: MaintenanceStoreFake;
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    store = createMaintenanceStoreFake();
    eventEmitter = { emit: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceMaintenanceService,
        { provide: RESOURCE_MAINTENANCE_STORE, useValue: store },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: MetricsService, useValue: mockMetricsService },
        { provide: RbacService, useValue: { getEffectivePermissions: jest.fn().mockResolvedValue(new Set()) } },
      ],
    }).compile();

    service = module.get<ResourceMaintenanceService>(ResourceMaintenanceService);
  });
  return {
    get mockMaintenance() {
      return mockMaintenance;
    },
    get service() {
      return service;
    },
    get store() {
      return store;
    },
    get eventEmitter() {
      return eventEmitter;
    },
  };
}
