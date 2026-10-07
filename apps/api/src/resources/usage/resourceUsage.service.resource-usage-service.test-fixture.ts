import {
  Resource,
  ResourceBillingConfiguration,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
  User,
} from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingService } from '../../billing/billing.service';
import { ProjectsService } from '../../projects/projects.service';
import { ResourceFlowsExecutorService } from '../flows/resource-flows-executor.service';
import { ResourceGroupsIntroducersService } from '../groups/introducers/resourceGroups.introducers.service';
import { ResourceGroupsIntroductionsService } from '../groups/introductions/resourceGroups.introductions.service';
import { ResourceGroupsService } from '../groups/resourceGroups.service';
import { ResourceIntroducersService } from '../introducers/resourceIntroducers.service';
import { ResourceIntroductionsService } from '../introductions/resouceIntroductions.service';
import { ResourceMaintenanceService } from '../maintenances/maintenance.service';
import { createResourceUsageMocks } from './resource-usage-mocks.test-fixture';
import { createResourceUsageTestingModule } from './resource-usage-module.test-fixture';
import { ResourceUsageService } from './resourceUsage.service';

export function registerResourceUsageServiceFixture() {
  const mocks = createResourceUsageMocks();
  const {
    mockRbacService,
    mockMetricsService,
    mockAuditService,
    lifecycleAttempts,
    mockResourceRetrainingService,
    mockResourceHealthService,
    mockResourceFormsService,
    createMockQueryBuilder,
  } = mocks;
  let service: ResourceUsageService;

  let resourceUsageRepository: jest.Mocked<Repository<ResourceUsage>>;

  let resourceRepository: jest.Mocked<Repository<Resource>>;

  let userRepository: jest.Mocked<Repository<User>>;

  let resourceIntroductionService: jest.Mocked<ResourceIntroductionsService>;

  let resourceIntroducersService: jest.Mocked<ResourceIntroducersService>;

  let resourceGroupsIntroductionsService: jest.Mocked<ResourceGroupsIntroductionsService>;

  let resourceGroupsIntroducersService: jest.Mocked<ResourceGroupsIntroducersService>;

  let resourceGroupsService: jest.Mocked<ResourceGroupsService>;

  let resourceMaintenanceService: jest.Mocked<ResourceMaintenanceService>;

  let eventEmitter: jest.Mocked<EventEmitter2>;

  let billingService: jest.Mocked<BillingService>;

  let projectsService: jest.Mocked<ProjectsService>;

  let flowExecutorService: { runFlow: jest.Mock; trackResourceActivity: jest.Mock };

  // Expose transactional entity manager for assertions
  let transactionalEntityManager: {
    createQueryBuilder: jest.Mock;
    getRepository: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    transaction: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    find: jest.Mock;
    findOneOrFail: jest.Mock;
  };
  beforeEach(async () => {
    const module: TestingModule = await createResourceUsageTestingModule(mocks);

    lifecycleAttempts.clear();
    service = module.get<ResourceUsageService>(ResourceUsageService);
    resourceRepository = module.get(getRepositoryToken(Resource));
    resourceUsageRepository = module.get(getRepositoryToken(ResourceUsage));
    userRepository = module.get(getRepositoryToken(User));
    resourceIntroductionService = module.get(ResourceIntroductionsService);
    resourceIntroducersService = module.get(ResourceIntroducersService);
    resourceGroupsIntroductionsService = module.get(ResourceGroupsIntroductionsService);
    resourceGroupsIntroducersService = module.get(ResourceGroupsIntroducersService);
    resourceGroupsService = module.get(ResourceGroupsService);
    resourceMaintenanceService = module.get(ResourceMaintenanceService);
    eventEmitter = module.get(EventEmitter2);
    billingService = module.get(BillingService);
    projectsService = module.get(ProjectsService);
    flowExecutorService = module.get(ResourceFlowsExecutorService) as unknown as {
      runFlow: jest.Mock;
      trackResourceActivity: jest.Mock;
    };

    // Provide transaction-capable manager on the repository
    transactionalEntityManager = {
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn(async (entity, data) => {
        if (entity === ResourceUsageLifecycleAttempt) lifecycleAttempts.set(data.id, data);
        return data;
      }),
      delete: jest.fn(async (entity, criteria) => {
        if (entity === ResourceUsageLifecycleAttempt)
          lifecycleAttempts.delete(typeof criteria === 'string' ? criteria : criteria.id);
        return { affected: 1 };
      }),
      find: jest.fn(async () => [...lifecycleAttempts.values()]),
      findOneOrFail: jest.fn((entity, opts) => resourceUsageRepository.findOne(opts)),
      transaction: jest.fn(async (cb: (em: typeof transactionalEntityManager) => Promise<unknown>) =>
        cb(transactionalEntityManager),
      ),
      // Ensure code paths that use getRepository(Entity).findOne work in tests
      getRepository: jest.fn((entity) => {
        if (entity === Resource) {
          return { findOne: resourceRepository.findOne } as unknown as Repository<Resource>;
        }
        if (entity === ResourceUsage) {
          return { findOne: resourceUsageRepository.findOne } as unknown as Repository<ResourceUsage>;
        }
        if (entity === User) {
          return { findOne: userRepository.findOne } as unknown as Repository<User>;
        }
        return { findOne: jest.fn() } as unknown as Repository<unknown>;
      }),
      // direct calls used in service
      findOne: jest.fn((entity, opts) => {
        if (entity === ResourceUsageLifecycleAttempt) {
          return (
            [...lifecycleAttempts.values()].find(
              (attempt) =>
                (!opts.where.id || attempt.id === opts.where.id) &&
                (!opts.where.resourceId || attempt.resourceId === opts.where.resourceId),
            ) ?? null
          );
        }
        if (entity === ResourceUsage) {
          return resourceUsageRepository.findOne(opts as never);
        }
        if (entity === Resource) {
          return resourceRepository.findOne(opts as never);
        }
        return null;
      }),
    } as unknown as {
      createQueryBuilder: jest.Mock;
      getRepository: jest.Mock;
      findOne: jest.Mock;
      update: jest.Mock;
      transaction: jest.Mock;
      save: jest.Mock;
      delete: jest.Mock;
      find: jest.Mock;
      findOneOrFail: jest.Mock;
    };

    // @ts-expect-error augment mock with manager
    resourceUsageRepository.manager = {
      transaction: jest.fn(async (cb: (em: typeof transactionalEntityManager) => Promise<unknown>) =>
        cb(transactionalEntityManager),
      ),
    } as unknown as { transaction: jest.Mock };

    mockResourceFormsService.prepareRequiredSubmissions.mockResolvedValue([]);
    // Silence and stub billing call inside transaction
    billingService.chargeForResourceUsage.mockResolvedValue(undefined);
    projectsService.findOneById.mockImplementation(
      async (_userId, projectId) =>
        ({
          id: projectId,
        }) as never,
    );

    // Default: billing disabled to avoid interfering with tests that don't explicitly mock billing
    billingService.getResourceBillingConfiguration.mockResolvedValue({
      id: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      resourceId: 1,
      resource: undefined as unknown as never,
      creditsPerUsage: 0,
      creditsPerMinute: 0,
      creditsPerOperatingMinute: 0,
    } as ResourceBillingConfiguration);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockRbacService.getEffectivePermissions.mockResolvedValue(new Set<string>());
  });
  return {
    get mockRbacService() {
      return mockRbacService;
    },
    get mockMetricsService() {
      return mockMetricsService;
    },
    get mockAuditService() {
      return mockAuditService;
    },
    get service() {
      return service;
    },
    get resourceUsageRepository() {
      return resourceUsageRepository;
    },
    get resourceRepository() {
      return resourceRepository;
    },
    get userRepository() {
      return userRepository;
    },
    get resourceIntroductionService() {
      return resourceIntroductionService;
    },
    get resourceIntroducersService() {
      return resourceIntroducersService;
    },
    get resourceGroupsIntroductionsService() {
      return resourceGroupsIntroductionsService;
    },
    get resourceGroupsIntroducersService() {
      return resourceGroupsIntroducersService;
    },
    get resourceGroupsService() {
      return resourceGroupsService;
    },
    get resourceMaintenanceService() {
      return resourceMaintenanceService;
    },
    get eventEmitter() {
      return eventEmitter;
    },
    get billingService() {
      return billingService;
    },
    get projectsService() {
      return projectsService;
    },
    get flowExecutorService() {
      return flowExecutorService;
    },
    get lifecycleAttempts() {
      return lifecycleAttempts;
    },
    get transactionalEntityManager() {
      return transactionalEntityManager;
    },
    get mockResourceRetrainingService() {
      return mockResourceRetrainingService;
    },
    get mockResourceHealthService() {
      return mockResourceHealthService;
    },
    get createMockQueryBuilder() {
      return createMockQueryBuilder;
    },
  };
}
