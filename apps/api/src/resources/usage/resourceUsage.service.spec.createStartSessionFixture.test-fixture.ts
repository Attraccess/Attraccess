import { Resource, ResourceType, User } from '@attraccess/database-entities';
import { inheritTestScope } from '../../test-utils/inherit-test-scope';
import { ResourceUsageServiceTestScope } from './resourceUsage.service.spec';

export function createStartSessionFixture(parentScope: ResourceUsageServiceTestScope) {
  const mockUser: User = { id: 1 } as User;

  const mockResource: Resource = {
    id: 1,
    name: 'Test Resource',
    allowTakeOver: false,
    type: ResourceType.Machine,
  } as Resource;

  const mockResourceWithTakeOver: Resource = {
    id: 1,
    name: 'Test Resource',
    allowTakeOver: true,
    type: ResourceType.Machine,
  } as Resource;

  const scope = inheritTestScope(
    {
      get flowExecutorService() {
        return parentScope.flowExecutorService;
      },
      set flowExecutorService(value: typeof parentScope.flowExecutorService) {
        parentScope.flowExecutorService = value;
      },
      get resourceRepository() {
        return parentScope.resourceRepository;
      },
      set resourceRepository(value: typeof parentScope.resourceRepository) {
        parentScope.resourceRepository = value;
      },
      get mockResource() {
        return mockResource;
      },
      get resourceMaintenanceService() {
        return parentScope.resourceMaintenanceService;
      },
      set resourceMaintenanceService(value: typeof parentScope.resourceMaintenanceService) {
        parentScope.resourceMaintenanceService = value;
      },
      get resourceIntroductionService() {
        return parentScope.resourceIntroductionService;
      },
      set resourceIntroductionService(value: typeof parentScope.resourceIntroductionService) {
        parentScope.resourceIntroductionService = value;
      },
      get resourceGroupsIntroductionsService() {
        return parentScope.resourceGroupsIntroductionsService;
      },
      set resourceGroupsIntroductionsService(value: typeof parentScope.resourceGroupsIntroductionsService) {
        parentScope.resourceGroupsIntroductionsService = value;
      },
      get resourceIntroducersService() {
        return parentScope.resourceIntroducersService;
      },
      set resourceIntroducersService(value: typeof parentScope.resourceIntroducersService) {
        parentScope.resourceIntroducersService = value;
      },
      get resourceGroupsIntroducersService() {
        return parentScope.resourceGroupsIntroducersService;
      },
      set resourceGroupsIntroducersService(value: typeof parentScope.resourceGroupsIntroducersService) {
        parentScope.resourceGroupsIntroducersService = value;
      },
      get resourceGroupsService() {
        return parentScope.resourceGroupsService;
      },
      set resourceGroupsService(value: typeof parentScope.resourceGroupsService) {
        parentScope.resourceGroupsService = value;
      },
      get resourceUsageRepository() {
        return parentScope.resourceUsageRepository;
      },
      set resourceUsageRepository(value: typeof parentScope.resourceUsageRepository) {
        parentScope.resourceUsageRepository = value;
      },
      get createMockQueryBuilder() {
        return parentScope.createMockQueryBuilder;
      },
      get transactionalEntityManager() {
        return parentScope.transactionalEntityManager;
      },
      set transactionalEntityManager(value: typeof parentScope.transactionalEntityManager) {
        parentScope.transactionalEntityManager = value;
      },
      get service() {
        return parentScope.service;
      },
      set service(value: typeof parentScope.service) {
        parentScope.service = value;
      },
      get mockUser() {
        return mockUser;
      },
      get lifecycleAttempts() {
        return parentScope.lifecycleAttempts;
      },
      get eventEmitter() {
        return parentScope.eventEmitter;
      },
      set eventEmitter(value: typeof parentScope.eventEmitter) {
        parentScope.eventEmitter = value;
      },
      get mockResourceWithTakeOver() {
        return mockResourceWithTakeOver;
      },
      get billingService() {
        return parentScope.billingService;
      },
      set billingService(value: typeof parentScope.billingService) {
        parentScope.billingService = value;
      },
      get mockResourceHealthService() {
        return parentScope.mockResourceHealthService;
      },
      get mockAuditService() {
        return parentScope.mockAuditService;
      },
    },
    parentScope,
  );
  return scope;
}
