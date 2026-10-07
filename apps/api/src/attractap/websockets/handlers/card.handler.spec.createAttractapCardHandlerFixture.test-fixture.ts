/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapCardHandler } from './card.handler';

export function createAttractapCardHandlerFixture() {
  let handler: AttractapCardHandler;

  let websocketService: { sockets: Map<string, any> };

  let attractapService: {
    findReaderById: jest.Mock;
    getNFCCardByUID: jest.Mock;
    getNFCCardByID: jest.Mock;
    generateNTAG424Key: jest.Mock;
    uint8ArrayToHexString: jest.Mock;
    createNFCCard: jest.Mock;
    deleteNFCCard: jest.Mock;
  };

  let usersService: { findOne: jest.Mock };

  let resourceUsageService: { canControllResource: jest.Mock };

  let resourceIntroducersService: { isIntroducer: jest.Mock };

  let metricsService: { attractapNfcTapsTotal: { inc: jest.Mock } };

  let resourceRepository: { findOne: jest.Mock };

  let rbacService: { getEffectivePermissions: jest.Mock };

  let audit: { recordAttractap: jest.Mock };

  const mockUser = { id: 1, username: 'testuser' };

  const mockReaderWithEnrollment = {
    id: 42,
    firmware: { capabilities: { cardEnrollment: true } },
  };

  function createMockSocket(overrides: any = {}): any {
    return {
      id: 'socket-1',
      readerId: 42,
      state: {
        lastAuthenticatedUserId: null,
        enrollment: null,
        enrollNewCardData: null,
        resetNfcCardData: null,
        ...(overrides.state || {}),
      },
      sendMessage: jest.fn().mockResolvedValue(true),
      sendBinaryData: jest.fn(),
      ...overrides,
    };
  }

  const scope = {
    get createMockSocket() {
      return createMockSocket;
    },
    get websocketService() {
      return websocketService;
    },
    set websocketService(value: typeof websocketService) {
      websocketService = value;
    },
    get handler() {
      return handler;
    },
    set handler(value: typeof handler) {
      handler = value;
    },
    get attractapService() {
      return attractapService;
    },
    set attractapService(value: typeof attractapService) {
      attractapService = value;
    },
    get usersService() {
      return usersService;
    },
    set usersService(value: typeof usersService) {
      usersService = value;
    },
    get mockUser() {
      return mockUser;
    },
    get audit() {
      return audit;
    },
    set audit(value: typeof audit) {
      audit = value;
    },
    get resourceUsageService() {
      return resourceUsageService;
    },
    set resourceUsageService(value: typeof resourceUsageService) {
      resourceUsageService = value;
    },
    get resourceIntroducersService() {
      return resourceIntroducersService;
    },
    set resourceIntroducersService(value: typeof resourceIntroducersService) {
      resourceIntroducersService = value;
    },
    get metricsService() {
      return metricsService;
    },
    set metricsService(value: typeof metricsService) {
      metricsService = value;
    },
    get resourceRepository() {
      return resourceRepository;
    },
    set resourceRepository(value: typeof resourceRepository) {
      resourceRepository = value;
    },
    get rbacService() {
      return rbacService;
    },
    set rbacService(value: typeof rbacService) {
      rbacService = value;
    },
    get mockReaderWithEnrollment() {
      return mockReaderWithEnrollment;
    },
  };
  return scope;
}
