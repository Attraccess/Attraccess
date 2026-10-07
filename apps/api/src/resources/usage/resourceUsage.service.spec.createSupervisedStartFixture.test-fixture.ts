import {
  Resource,
  ResourceUsage,
  ResourceType,
  ResourceUsageAction,
  User,
  SupervisionMode,
} from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { inheritTestScope } from '../../test-utils/inherit-test-scope';
import { ResourceUsageServiceTestScope } from './resourceUsage.service.spec';

export function createSupervisedStartFixture(parentScope: ResourceUsageServiceTestScope) {
  const requester: User = { id: 1, username: 'requester' } as User;

  const supervisor: User = { id: 2, username: 'supervisor' } as User;

  const supervisedResource = (mode: SupervisionMode): Resource =>
    ({
      id: 1,
      name: 'Supervised Resource',
      allowTakeOver: false,
      type: ResourceType.Machine,
      supervisionMode: mode,
    }) as Resource;

  const mockSuccessfulSessionCreation = (supervisorUserId: number) => {
    const createdSession = {
      id: 1,
      resourceId: 1,
      userId: 1,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date(),
      endTime: null,
      isFinalized: false,
      supervisorUserId,
      user: { id: 1 } as User,
      resource: { id: 1 } as Resource,
    } as ResourceUsage;
    const finalizedSession = { ...createdSession, isFinalized: true };

    parentScope.resourceUsageRepository.findOne
      .mockResolvedValueOnce(null) // getActiveSession
      .mockResolvedValueOnce(createdSession) // newly created session
      .mockResolvedValueOnce(finalizedSession) // finalized session for return
      .mockResolvedValueOnce(finalizedSession); // emitUsageEvent fetch

    const mockQueryBuilder = parentScope.createMockQueryBuilder(null);
    (parentScope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );
    return { finalizedSession, mockQueryBuilder };
  };

  const scope = inheritTestScope(
    {
      get resourceRepository() {
        return parentScope.resourceRepository;
      },
      set resourceRepository(value: typeof parentScope.resourceRepository) {
        parentScope.resourceRepository = value;
      },
      get supervisedResource() {
        return supervisedResource;
      },
      get resourceMaintenanceService() {
        return parentScope.resourceMaintenanceService;
      },
      set resourceMaintenanceService(value: typeof parentScope.resourceMaintenanceService) {
        parentScope.resourceMaintenanceService = value;
      },
      get userRepository() {
        return parentScope.userRepository;
      },
      set userRepository(value: typeof parentScope.userRepository) {
        parentScope.userRepository = value;
      },
      get supervisor() {
        return supervisor;
      },
      get resourceIntroducersService() {
        return parentScope.resourceIntroducersService;
      },
      set resourceIntroducersService(value: typeof parentScope.resourceIntroducersService) {
        parentScope.resourceIntroducersService = value;
      },
      get mockSuccessfulSessionCreation() {
        return mockSuccessfulSessionCreation;
      },
      get service() {
        return parentScope.service;
      },
      set service(value: typeof parentScope.service) {
        parentScope.service = value;
      },
      get requester() {
        return requester;
      },
      get eventEmitter() {
        return parentScope.eventEmitter;
      },
      set eventEmitter(value: typeof parentScope.eventEmitter) {
        parentScope.eventEmitter = value;
      },
      get mockRbacService() {
        return parentScope.mockRbacService;
      },
      get resourceIntroductionService() {
        return parentScope.resourceIntroductionService;
      },
      set resourceIntroductionService(value: typeof parentScope.resourceIntroductionService) {
        parentScope.resourceIntroductionService = value;
      },
    },
    parentScope,
  );
  return scope;
}
