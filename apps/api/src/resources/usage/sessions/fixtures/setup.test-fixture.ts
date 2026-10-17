import { Test, TestingModule } from '@nestjs/testing';
import { ResourceUsageService } from '../resource-usage.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Resource,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
  User,
  ResourceBillingConfiguration,
} from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourcesService } from '../../../resources.service';
import { ResourceIntroductionsService } from '../../../introductions/resouceIntroductions.service';
import { ResourceIntroducersService } from '../../../introducers/resourceIntroducers.service';
import { ResourceGroupsIntroductionsService } from '../../../groups/introductions/resourceGroups.introductions.service';
import { ResourceGroupsIntroducersService } from '../../../groups/introducers/resourceGroups.introducers.service';
import { ResourceGroupsService } from '../../../groups/resourceGroups.service';
import { ResourceRetrainingService } from '../../../retraining/resourceRetraining.service';
import { ResourceMaintenanceService } from '../../../maintenances/maintenance.service';
import { BillingService } from '../../../../billing/charges/billing.service';
import { ResourceFlowsExecutorService } from '../../../flows/execution/resource-flows-executor.service';
import { ProjectsService } from '../../../../projects/projects.service';
import { ResourceFormsService } from '../../../forms/forms.service';
import { MetricsService } from '../../../../metrics/metrics.service';
import { PluginEventsService } from '../../../../plugin-system/plugin-events.service';
import { RbacService } from '../../../../users-and-auth/rbac/rbac.service';
import { VALKEY_CLIENT } from '../../../../valkey/valkey.module';
import { AuditService } from '../../../../audit/audit.service';
import { ResourceUsageServiceTestScope } from '../resource-usage.service.spec';
export async function resetTestFixture(scope: ResourceUsageServiceTestScope) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ResourceUsageService,
      {
        provide: getRepositoryToken(Resource),
        useFactory: scope.mockRepository,
      },
      {
        provide: getRepositoryToken(ResourceUsage),
        useFactory: scope.mockRepository,
      },
      {
        provide: getRepositoryToken(User),
        useFactory: scope.mockRepository,
      },
      {
        provide: ResourcesService,
        useValue: scope.mockResourcesService,
      },
      {
        provide: ResourceIntroductionsService,
        useValue: scope.mockResourceIntroductionService,
      },
      {
        provide: ResourceIntroducersService,
        useValue: scope.mockResourceIntroducersService,
      },
      {
        provide: ResourceGroupsIntroductionsService,
        useValue: scope.mockResourceGroupsIntroductionsService,
      },
      {
        provide: ResourceGroupsIntroducersService,
        useValue: scope.mockResourceGroupsIntroducersService,
      },
      {
        provide: ResourceGroupsService,
        useValue: scope.mockResourceGroupsService,
      },
      {
        provide: ResourceRetrainingService,
        useValue: scope.mockResourceRetrainingService,
      },
      {
        provide: ResourceMaintenanceService,
        useValue: scope.mockResourceMaintenanceService,
      },
      {
        provide: EventEmitter2,
        useValue: scope.mockEventEmitter,
      },
      {
        provide: VALKEY_CLIENT,
        useValue: null,
      },
      {
        provide: BillingService,
        useValue: scope.mockBillingService,
      },
      {
        provide: ProjectsService,
        useValue: scope.mockProjectsService,
      },
      {
        provide: require('../../../flows/execution/resource-flows-executor.service').ResourceFlowsExecutorService,
        useValue: {
          runFlow: jest.fn().mockResolvedValue([]),
          trackResourceActivity: jest.fn(),
        },
      },
      {
        provide: ResourceFormsService,
        useValue: scope.mockResourceFormsService,
      },
      {
        provide: MetricsService,
        useValue: scope.mockMetricsService,
      },
      {
        provide: require('../../../health/resource-health.service').ResourceHealthService,
        useValue: scope.mockResourceHealthService,
      },
      {
        provide: PluginEventsService,
        useValue: scope.mockPluginEventsService,
      },
      {
        provide: RbacService,
        useValue: scope.mockRbacService,
      },
      { provide: AuditService, useValue: scope.mockAuditService },
    ],
  }).compile();

  scope.lifecycleAttempts.clear();
  scope.service = module.get<ResourceUsageService>(ResourceUsageService);
  scope.resourceRepository = module.get(getRepositoryToken(Resource));
  scope.resourceUsageRepository = module.get(getRepositoryToken(ResourceUsage));
  scope.userRepository = module.get(getRepositoryToken(User));
  scope.resourceIntroductionService = module.get(ResourceIntroductionsService);
  scope.resourceIntroducersService = module.get(ResourceIntroducersService);
  scope.resourceGroupsIntroductionsService = module.get(ResourceGroupsIntroductionsService);
  scope.resourceGroupsIntroducersService = module.get(ResourceGroupsIntroducersService);
  scope.resourceGroupsService = module.get(ResourceGroupsService);
  scope.resourceMaintenanceService = module.get(ResourceMaintenanceService);
  scope.eventEmitter = module.get(EventEmitter2);
  scope.billingService = module.get(BillingService);
  scope.projectsService = module.get(ProjectsService);
  scope.flowExecutorService = module.get(ResourceFlowsExecutorService) as unknown as {
    runFlow: jest.Mock;
    trackResourceActivity: jest.Mock;
  };

  // Provide transaction-capable manager on the repository
  scope.transactionalEntityManager = {
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
      if (entity === ResourceUsageLifecycleAttempt) scope.lifecycleAttempts.set(data.id, data);
      return data;
    }),
    delete: jest.fn(async (entity, criteria) => {
      if (entity === ResourceUsageLifecycleAttempt)
        scope.lifecycleAttempts.delete(typeof criteria === 'string' ? criteria : criteria.id);
      return { affected: 1 };
    }),
    find: jest.fn(async () => [...scope.lifecycleAttempts.values()]),
    findOneOrFail: jest.fn((entity, opts) => scope.resourceUsageRepository.findOne(opts)),
    transaction: jest.fn(async (cb: (em: typeof scope.transactionalEntityManager) => Promise<unknown>) =>
      cb(scope.transactionalEntityManager),
    ),
    // Ensure code paths that use getRepository(Entity).findOne work in tests
    getRepository: jest.fn((entity) => {
      if (entity === Resource) {
        return { findOne: scope.resourceRepository.findOne } as unknown as Repository<Resource>;
      }
      if (entity === ResourceUsage) {
        return { findOne: scope.resourceUsageRepository.findOne } as unknown as Repository<ResourceUsage>;
      }
      if (entity === User) {
        return { findOne: scope.userRepository.findOne } as unknown as Repository<User>;
      }
      return { findOne: jest.fn() } as unknown as Repository<unknown>;
    }),
    // direct calls used in service
    findOne: jest.fn((entity, opts) => {
      if (entity === ResourceUsageLifecycleAttempt) {
        return (
          [...scope.lifecycleAttempts.values()].find(
            (attempt) =>
              (!opts.where.id || attempt.id === opts.where.id) &&
              (!opts.where.resourceId || attempt.resourceId === opts.where.resourceId),
          ) ?? null
        );
      }
      if (entity === ResourceUsage) {
        if (opts.where.lifecyclePending && !opts.where.userId) return null; // Reservation gate.
        return scope.resourceUsageRepository.findOne(opts as never);
      }
      if (entity === Resource) {
        return scope.resourceRepository.findOne(opts as never);
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
  scope.resourceUsageRepository.manager = {
    transaction: jest.fn(async (cb: (em: typeof scope.transactionalEntityManager) => Promise<unknown>) =>
      cb(scope.transactionalEntityManager),
    ),
  } as unknown as { transaction: jest.Mock };

  scope.mockResourceFormsService.prepareRequiredSubmissions.mockResolvedValue([]);
  // Silence and stub billing call inside transaction
  scope.billingService.chargeForResourceUsage.mockResolvedValue(undefined);
  scope.projectsService.findOneById.mockImplementation(
    async (_userId, projectId) =>
      ({
        id: projectId,
      }) as never,
  );

  // Default: billing disabled to avoid interfering with tests that don't explicitly mock billing
  scope.billingService.getResourceBillingConfiguration.mockResolvedValue({
    id: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    resourceId: 1,
    resource: undefined as unknown as never,
    creditsPerUsage: 0,
    creditsPerMinute: 0,
    creditsPerOperatingMinute: 0,
  } as ResourceBillingConfiguration);
}
