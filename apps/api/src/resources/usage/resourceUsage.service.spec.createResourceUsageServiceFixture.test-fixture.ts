import { ResourceUsageService } from './resourceUsage.service';
import { Resource, ResourceUsage, ResourceUsageLifecycleAttempt, User } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceIntroductionsService } from '../introductions/resouceIntroductions.service';
import { ResourceIntroducersService } from '../introducers/resourceIntroducers.service';
import { ResourceGroupsIntroductionsService } from '../groups/introductions/resourceGroups.introductions.service';
import { ResourceGroupsIntroducersService } from '../groups/introducers/resourceGroups.introducers.service';
import { ResourceGroupsService } from '../groups/resourceGroups.service';
import { ResourceMaintenanceService } from '../maintenances/maintenance.service';
import { BillingService } from '../../billing/billing.service';
import { ProjectsService } from '../../projects/projects.service';
import { ResourceFormsService } from '../forms/forms.service';
import { mockRbacService } from './resourceUsage.service.spec.mock-rbac-service';
import { mockPluginEventsService } from './resourceUsage.service.spec.mock-plugin-events-service';
import { mockMetricsService } from './resourceUsage.service.spec.mock-metrics-service';
import { mockAuditService } from './resourceUsage.service.spec.mock-audit-service';
import { mockRepository } from './resourceUsage.service.mock-repository.test-fixture';
import type { MockQueryBuilder } from './resourceUsage.service.query-builder.test-fixture';

export function createResourceUsageServiceFixture() {
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
  const lifecycleAttempts = new Map<string, ResourceUsageLifecycleAttempt>();

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
  const mockEventEmitter = {
    emit: jest.fn(),
    emitAsync: jest.fn().mockResolvedValue([]),
  };

  const mockResourcesService = {
    getResourceById: jest.fn(),
  };

  const mockResourceIntroductionService = {
    hasValidIntroduction: jest.fn(),
    canGiveIntroductions: jest.fn(),
  };

  const mockResourceIntroducersService = {
    isIntroducer: jest.fn(),
    canMaintain: jest.fn(),
  };

  const mockResourceGroupsIntroductionsService = {
    hasValidIntroduction: jest.fn(),
  };

  const mockResourceGroupsIntroducersService = {
    isIntroducer: jest.fn(),
  };

  const mockResourceGroupsService = {
    getGroupsOfResource: jest.fn(),
  };

  const mockResourceRetrainingService = {
    isResourceIntroductionBlocked: jest.fn().mockResolvedValue(false),
    isGroupIntroductionBlocked: jest.fn().mockResolvedValue(false),
    getResourceRetrainingStatus: jest.fn().mockResolvedValue({ blocksAccess: false, dueAt: null }),
  };

  const mockResourceMaintenanceService = {
    hasActiveMaintenance: jest.fn(),
    canManageMaintenance: jest.fn(),
  };

  const mockResourceHealthService = {
    isResourceUnhealthy: jest.fn().mockResolvedValue(false),
    reportHealth: jest.fn(),
    getSummary: jest.fn(),
    listForResource: jest.fn(),
  };

  const mockBillingService = {
    validateResourceUsageStart: jest.fn().mockResolvedValue(undefined),
    notifyResourceUsageCharge: jest.fn().mockResolvedValue(undefined),
    getResourceBillingConfiguration: jest.fn(),
    getBalance: jest.fn(),
    handleResourceUsageStart: jest.fn(),
    chargeForResourceUsage: jest.fn(),
  } as unknown as jest.Mocked<BillingService>;

  const mockProjectsService = {
    findOneById: jest.fn(),
  } as unknown as jest.Mocked<ProjectsService>;

  const mockResourceFormsService = {
    getFormsForAction: jest.fn(),
    prepareRequiredSubmissions: jest.fn(),
  } as unknown as jest.Mocked<ResourceFormsService>;

  const createMockQueryBuilder = (getOneResult: ResourceUsage | null = null): MockQueryBuilder => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(getOneResult),
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ identifiers: [{ id: 1 }] }),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  });

  const scope = {
    get resourceUsageRepository() {
      return resourceUsageRepository;
    },
    set resourceUsageRepository(value: typeof resourceUsageRepository) {
      resourceUsageRepository = value;
    },
    get service() {
      return service;
    },
    set service(value: typeof service) {
      service = value;
    },
    get projectsService() {
      return projectsService;
    },
    set projectsService(value: typeof projectsService) {
      projectsService = value;
    },
    get resourceRepository() {
      return resourceRepository;
    },
    set resourceRepository(value: typeof resourceRepository) {
      resourceRepository = value;
    },
    get userRepository() {
      return userRepository;
    },
    set userRepository(value: typeof userRepository) {
      userRepository = value;
    },
    get resourceIntroductionService() {
      return resourceIntroductionService;
    },
    set resourceIntroductionService(value: typeof resourceIntroductionService) {
      resourceIntroductionService = value;
    },
    get resourceIntroducersService() {
      return resourceIntroducersService;
    },
    set resourceIntroducersService(value: typeof resourceIntroducersService) {
      resourceIntroducersService = value;
    },
    get resourceGroupsIntroductionsService() {
      return resourceGroupsIntroductionsService;
    },
    set resourceGroupsIntroductionsService(value: typeof resourceGroupsIntroductionsService) {
      resourceGroupsIntroductionsService = value;
    },
    get resourceGroupsIntroducersService() {
      return resourceGroupsIntroducersService;
    },
    set resourceGroupsIntroducersService(value: typeof resourceGroupsIntroducersService) {
      resourceGroupsIntroducersService = value;
    },
    get resourceGroupsService() {
      return resourceGroupsService;
    },
    set resourceGroupsService(value: typeof resourceGroupsService) {
      resourceGroupsService = value;
    },
    get resourceMaintenanceService() {
      return resourceMaintenanceService;
    },
    set resourceMaintenanceService(value: typeof resourceMaintenanceService) {
      resourceMaintenanceService = value;
    },
    get eventEmitter() {
      return eventEmitter;
    },
    set eventEmitter(value: typeof eventEmitter) {
      eventEmitter = value;
    },
    get billingService() {
      return billingService;
    },
    set billingService(value: typeof billingService) {
      billingService = value;
    },
    get flowExecutorService() {
      return flowExecutorService;
    },
    set flowExecutorService(value: typeof flowExecutorService) {
      flowExecutorService = value;
    },
    get lifecycleAttempts() {
      return lifecycleAttempts;
    },
    get transactionalEntityManager() {
      return transactionalEntityManager;
    },
    set transactionalEntityManager(value: typeof transactionalEntityManager) {
      transactionalEntityManager = value;
    },
    get mockRepository() {
      return mockRepository;
    },
    get mockEventEmitter() {
      return mockEventEmitter;
    },
    get mockResourcesService() {
      return mockResourcesService;
    },
    get mockResourceIntroductionService() {
      return mockResourceIntroductionService;
    },
    get mockResourceIntroducersService() {
      return mockResourceIntroducersService;
    },
    get mockResourceGroupsIntroductionsService() {
      return mockResourceGroupsIntroductionsService;
    },
    get mockResourceGroupsIntroducersService() {
      return mockResourceGroupsIntroducersService;
    },
    get mockResourceGroupsService() {
      return mockResourceGroupsService;
    },
    get mockResourceRetrainingService() {
      return mockResourceRetrainingService;
    },
    get mockResourceMaintenanceService() {
      return mockResourceMaintenanceService;
    },
    get mockResourceHealthService() {
      return mockResourceHealthService;
    },
    get mockBillingService() {
      return mockBillingService;
    },
    get mockProjectsService() {
      return mockProjectsService;
    },
    get mockResourceFormsService() {
      return mockResourceFormsService;
    },
    get createMockQueryBuilder() {
      return createMockQueryBuilder;
    },
    get mockMetricsService() {
      return mockMetricsService;
    },
    get mockPluginEventsService() {
      return mockPluginEventsService;
    },
    get mockRbacService() {
      return mockRbacService;
    },
    get mockAuditService() {
      return mockAuditService;
    },
  };
  return scope;
}
