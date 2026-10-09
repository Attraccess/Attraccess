import { ResourceUsage, User } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { inheritTestScope } from '../../../../test-utils/inherit-test-scope';
import { ResourceUsageServiceTestScope } from '../resource-usage.service.spec';

export function createEndSessionFixture(parentScope: ResourceUsageServiceTestScope) {
  const mockUser: User = { id: 1 } as User;

  const setupEndSession = () => {
    const mockActiveSession = {
      id: 1,
      resourceId: 1,
      userId: 1,
      startTime: new Date(),
      user: { id: 1, username: 'owner' } as User,
    } as ResourceUsage;
    const mockUpdatedSession = { ...mockActiveSession, endTime: new Date(), endNotes: 'note text' };
    parentScope.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession)
      .mockResolvedValueOnce(mockUpdatedSession)
      .mockResolvedValueOnce(mockUpdatedSession);
    const mockUpdateQueryBuilder = parentScope.createMockQueryBuilder(null);
    (mockUpdateQueryBuilder.update as jest.Mock).mockReturnValue(mockUpdateQueryBuilder);
    parentScope.resourceUsageRepository.createQueryBuilder.mockReturnValue(
      mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );
  };

  const scope = inheritTestScope(
    {
      get resourceUsageRepository() {
        return parentScope.resourceUsageRepository;
      },
      set resourceUsageRepository(value: typeof parentScope.resourceUsageRepository) {
        parentScope.resourceUsageRepository = value;
      },
      get createMockQueryBuilder() {
        return parentScope.createMockQueryBuilder;
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
      get eventEmitter() {
        return parentScope.eventEmitter;
      },
      set eventEmitter(value: typeof parentScope.eventEmitter) {
        parentScope.eventEmitter = value;
      },
      get mockAuditService() {
        return parentScope.mockAuditService;
      },
      get transactionalEntityManager() {
        return parentScope.transactionalEntityManager;
      },
      set transactionalEntityManager(value: typeof parentScope.transactionalEntityManager) {
        parentScope.transactionalEntityManager = value;
      },
      get flowExecutorService() {
        return parentScope.flowExecutorService;
      },
      set flowExecutorService(value: typeof parentScope.flowExecutorService) {
        parentScope.flowExecutorService = value;
      },
      get mockMetricsService() {
        return parentScope.mockMetricsService;
      },
      get billingService() {
        return parentScope.billingService;
      },
      set billingService(value: typeof parentScope.billingService) {
        parentScope.billingService = value;
      },
      get lifecycleAttempts() {
        return parentScope.lifecycleAttempts;
      },
      get mockRbacService() {
        return parentScope.mockRbacService;
      },
      get setupEndSession() {
        return setupEndSession;
      },
      get resourceIntroducersService() {
        return parentScope.resourceIntroducersService;
      },
      set resourceIntroducersService(value: typeof parentScope.resourceIntroducersService) {
        parentScope.resourceIntroducersService = value;
      },
    },
    parentScope,
  );
  return scope;
}
