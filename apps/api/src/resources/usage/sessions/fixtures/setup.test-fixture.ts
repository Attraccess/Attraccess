import { usageOperationsFake } from './operations.test-fixture';
import { DatabaseTransactions } from '../../../../database/transaction-scope';
import { UsagePersistence } from '../../persistence/port';
import { Test, TestingModule } from '@nestjs/testing';
import { ResourceUsageService } from '../resource-usage.service';
import { ResourceBillingConfiguration } from '@attraccess/database-entities';
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
  scope.operations = usageOperationsFake(scope.lifecycleAttempts);
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ResourceUsageService,
      { provide: UsagePersistence, useValue: scope.operations.persistence },
      { provide: DatabaseTransactions, useValue: scope.operations.transactionDriver.transactions },
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
