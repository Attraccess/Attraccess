import { ResourceUsage, ResourceUsageLifecycleAttempt } from '@attraccess/database-entities';
import { BillingService } from '../../billing/billing.service';
import { ProjectsService } from '../../projects/projects.service';
import { ResourceFormsService } from '../forms/forms.service';
export function createResourceUsageMocks() {
  const mockRbacService = {
    getEffectivePermissions: jest.fn().mockResolvedValue(new Set<string>()),
  };

  const mockPluginEventsService = {
    emit: jest.fn(),
    emitAsync: jest.fn(),
    onEvent: jest.fn(),
  };

  const mockMetricsService = {
    resourceUsageSessionsTotal: { inc: jest.fn() },
    resourceUsageSessionsActive: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
    resourceUsageDurationSeconds: { observe: jest.fn() },
    authorizationCacheRequestsTotal: { inc: jest.fn() },
    authorizationCacheSize: { set: jest.fn() },
  };

  const mockAuditService = { recordResource: jest.fn().mockResolvedValue(undefined) };

  // Expose transactional entity manager for assertions
  const lifecycleAttempts = new Map<string, ResourceUsageLifecycleAttempt>();

  const mockRepository = () => ({
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      getMany: jest.fn(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    })),
  });

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

  type MockQueryBuilder = {
    where: jest.Mock;
    andWhere: jest.Mock;
    getOne: jest.Mock;
    insert: jest.Mock;
    into: jest.Mock;
    values: jest.Mock;
    execute: jest.Mock;
    update: jest.Mock;
    set: jest.Mock;
  };

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
  return {
    mockRbacService,
    mockPluginEventsService,
    mockMetricsService,
    mockAuditService,
    lifecycleAttempts,
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
    createMockQueryBuilder,
  };
}
