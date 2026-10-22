import { Resource, ResourceMaintenance } from '@attraccess/application-models';
import { MAINTENANCE_OPERATIONS, MaintenancePersistence } from './persistence/port';
import { operationTransactionsFake } from '../../database/testing/operation-transactions.test-fixture';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from '../../metrics/metrics.service';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';
import { ResourceMaintenanceService } from './maintenance.service';

const mockMetricsService = {
  resourceMaintenanceTotal: { inc: jest.fn() },
  resourceMaintenanceOverdue: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
};

// Mock the database entities to avoid import issues
const mockResource = {
  id: 1,
  name: 'Test Resource',
} as Resource;

const mockMaintenance = {
  id: 1,
  startTime: new Date('2025-01-01T10:00:00.000Z'),
  endTime: null,
  reason: 'Test maintenance',
  resource: mockResource,
} as ResourceMaintenance;
export function registerMaintenanceServiceFixture() {
  let service: ResourceMaintenanceService;

  let persistence: jest.Mocked<MaintenancePersistence>;
  let transactionDriver: ReturnType<typeof operationTransactionsFake>;

  beforeEach(async () => {
    persistence = {
      resource: jest.fn(),
      maintenance: jest.fn(),
      page: jest.fn(),
      hasActive: jest.fn(),
      activeResourceIds: jest.fn(),
      managedResourcePairs: jest.fn(),
      directIntroducer: jest.fn(),
      groupIntroducer: jest.fn(),
      createMaintenance: jest.fn(),
      saveMaintenance: jest.fn(),
    };
    transactionDriver = operationTransactionsFake();
    transactionDriver.bind(MAINTENANCE_OPERATIONS, persistence);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceMaintenanceService,
        { provide: MaintenancePersistence, useValue: persistence },
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
  });
  return {
    get mockResource() {
      return mockResource;
    },
    get mockMaintenance() {
      return mockMaintenance;
    },
    get service() {
      return service;
    },
    get persistence() {
      return persistence;
    },
    get transactionDriver() {
      return transactionDriver;
    },
  };
}
