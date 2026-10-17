import { sqliteRepositoryFixture } from '../../../../database/conformance/sqlite-fixture';
import { DatabaseTransactions } from '../../../../database/transaction-scope';
import { UsagePersistence } from '../../persistence/port';
import { Resource, ResourceUsage, User, ResourceUsageLifecycleAttempt } from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from '../../../../audit/audit.service';
import { BillingService } from '../../../../billing/charges/billing.service';
import { MetricsService } from '../../../../metrics/metrics.service';
import { PluginEventsService } from '../../../../plugin-system/plugin-events.service';
import { ProjectsService } from '../../../../projects/projects.service';
import { RbacService } from '../../../../users-and-auth/rbac/rbac.service';
import { VALKEY_CLIENT } from '../../../../valkey/valkey.module';
import { ResourceFormsService } from '../../../forms/forms.service';
import { ResourceGroupsIntroducersService } from '../../../groups/introducers/resourceGroups.introducers.service';
import { ResourceGroupsIntroductionsService } from '../../../groups/introductions/resourceGroups.introductions.service';
import { ResourceGroupsService } from '../../../groups/resourceGroups.service';
import { ResourceIntroducersService } from '../../../introducers/resourceIntroducers.service';
import { ResourceIntroductionsService } from '../../../introductions/resouceIntroductions.service';
import { ResourceMaintenanceService } from '../../../maintenances/maintenance.service';
import { ResourcesService } from '../../../resources.service';
import { ResourceRetrainingService } from '../../../retraining/resourceRetraining.service';
import { createResourceUsageMocks } from './mocks.test-fixture';
import { ResourceUsageService } from '../resource-usage.service';
const PERSISTENCE_FIXTURE = Symbol('usage persistence fixture');

export function createResourceUsageTestingModule(mocks: ReturnType<typeof createResourceUsageMocks>) {
  const {
    mockRbacService,
    mockPluginEventsService,
    mockMetricsService,
    mockAuditService,
    mockRepository,
    mockEventEmitter,
    mockResourcesService,
    mockResourceIntroductionService,
    mockResourceIntroducersService,
    mockResourceGroupsIntroductionsService,
    mockResourceGroupsIntroducersService,
    mockResourceGroupsService,
    mockResourceRetrainingService,
    mockResourceMaintenanceService,
    mockResourceHealthService,
    mockBillingService,
    mockProjectsService,
    mockResourceFormsService,
  } = mocks;
  return Test.createTestingModule({
    providers: [
      ResourceUsageService,
      {
        provide: PERSISTENCE_FIXTURE,
        useFactory: (
          resources: object,
          usages: { manager: { transaction: (work: (manager: never) => Promise<unknown>) => Promise<unknown> } },
          users: object,
        ) =>
          sqliteRepositoryFixture(
            (entity) =>
              entity === Resource
                ? resources
                : entity === ResourceUsage
                  ? usages
                  : entity === ResourceUsageLifecycleAttempt
                    ? { find: async () => [...mocks.lifecycleAttempts.values()] }
                    : users,
            (work) => usages.manager.transaction(work),
          ),
        inject: [getRepositoryToken(Resource), getRepositoryToken(ResourceUsage), getRepositoryToken(User)],
      },
      {
        provide: UsagePersistence,
        useFactory: (fixture: ReturnType<typeof sqliteRepositoryFixture>) => fixture.usage,
        inject: [PERSISTENCE_FIXTURE],
      },
      {
        provide: DatabaseTransactions,
        useFactory: (fixture: ReturnType<typeof sqliteRepositoryFixture>) => fixture.transactions,
        inject: [PERSISTENCE_FIXTURE],
      },
      {
        provide: getRepositoryToken(Resource),
        useFactory: mockRepository,
      },
      {
        provide: getRepositoryToken(ResourceUsage),
        useFactory: mockRepository,
      },
      {
        provide: getRepositoryToken(User),
        useFactory: mockRepository,
      },
      {
        provide: ResourcesService,
        useValue: mockResourcesService,
      },
      {
        provide: ResourceIntroductionsService,
        useValue: mockResourceIntroductionService,
      },
      {
        provide: ResourceIntroducersService,
        useValue: mockResourceIntroducersService,
      },
      {
        provide: ResourceGroupsIntroductionsService,
        useValue: mockResourceGroupsIntroductionsService,
      },
      {
        provide: ResourceGroupsIntroducersService,
        useValue: mockResourceGroupsIntroducersService,
      },
      {
        provide: ResourceGroupsService,
        useValue: mockResourceGroupsService,
      },
      {
        provide: ResourceRetrainingService,
        useValue: mockResourceRetrainingService,
      },
      {
        provide: ResourceMaintenanceService,
        useValue: mockResourceMaintenanceService,
      },
      {
        provide: EventEmitter2,
        useValue: mockEventEmitter,
      },
      {
        provide: VALKEY_CLIENT,
        useValue: null,
      },
      {
        provide: BillingService,
        useValue: mockBillingService,
      },
      {
        provide: ProjectsService,
        useValue: mockProjectsService,
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
        useValue: mockResourceFormsService,
      },
      {
        provide: MetricsService,
        useValue: mockMetricsService,
      },
      {
        provide: require('../../../health/resource-health.service').ResourceHealthService,
        useValue: mockResourceHealthService,
      },
      {
        provide: PluginEventsService,
        useValue: mockPluginEventsService,
      },
      {
        provide: RbacService,
        useValue: mockRbacService,
      },
      { provide: AuditService, useValue: mockAuditService },
    ],
  }).compile();
}
