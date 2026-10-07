import { inheritTestScope } from '../../../test-utils/inherit-test-scope';
import { AttractapCardHandlerTestScope } from './card.handler.spec.define-attractap-card-handler-tests';

export function createHandleCardAuthenticationRequestFixture(parentScope: AttractapCardHandlerTestScope) {
  const activeCard = {
    keyNo: 3,
    key: 'cardkey',
    isActive: true,
    user: {
      id: 5,
      username: 'carduser',
    },
  };

  const scope = inheritTestScope(
    {
      get createMockSocket() {
        return parentScope.createMockSocket;
      },
      get attractapService() {
        return parentScope.attractapService;
      },
      set attractapService(value: typeof parentScope.attractapService) {
        parentScope.attractapService = value;
      },
      get activeCard() {
        return activeCard;
      },
      get handler() {
        return parentScope.handler;
      },
      set handler(value: typeof parentScope.handler) {
        parentScope.handler = value;
      },
      get metricsService() {
        return parentScope.metricsService;
      },
      set metricsService(value: typeof parentScope.metricsService) {
        parentScope.metricsService = value;
      },
      get resourceUsageService() {
        return parentScope.resourceUsageService;
      },
      set resourceUsageService(value: typeof parentScope.resourceUsageService) {
        parentScope.resourceUsageService = value;
      },
      get resourceIntroducersService() {
        return parentScope.resourceIntroducersService;
      },
      set resourceIntroducersService(value: typeof parentScope.resourceIntroducersService) {
        parentScope.resourceIntroducersService = value;
      },
      get rbacService() {
        return parentScope.rbacService;
      },
      set rbacService(value: typeof parentScope.rbacService) {
        parentScope.rbacService = value;
      },
      get resourceRepository() {
        return parentScope.resourceRepository;
      },
      set resourceRepository(value: typeof parentScope.resourceRepository) {
        parentScope.resourceRepository = value;
      },
    },
    parentScope,
  );
  return scope;
}
