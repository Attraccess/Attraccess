import { Resource, ResourceIntroducer, ResourceMaintenance } from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
};

const mockMaintenance = {
  id: 1,
  startTime: new Date('2025-01-01T10:00:00.000Z'),
  endTime: null,
  reason: 'Test maintenance',
  resource: mockResource,
};
export function registerMaintenanceServiceFixture() {
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
    get maintenanceRepository() {
      return maintenanceRepository;
    },
    get resourceRepository() {
      return resourceRepository;
    },
    get resourceIntroducerRepository() {
      return resourceIntroducerRepository;
    },
  };
}
