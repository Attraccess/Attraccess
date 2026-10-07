/* eslint-disable @typescript-eslint/no-explicit-any */
import { AttractapCardHandler } from './card.handler';

export function registerFixture0() {
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

  beforeEach(() => {
    handler = Object.create(AttractapCardHandler.prototype);
    (handler as any).logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    websocketService = { sockets: new Map() };
    attractapService = {
      findReaderById: jest.fn().mockResolvedValue(mockReaderWithEnrollment),
      getNFCCardByUID: jest.fn().mockResolvedValue(null),
      getNFCCardByID: jest
        .fn()
        .mockResolvedValue({ id: 7, key: 'aabbccddeeff00112233445566778899', keyNo: 1, user: mockUser }),
      generateNTAG424Key: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      uint8ArrayToHexString: jest.fn().mockReturnValue('deadbeef'),
      createNFCCard: jest.fn().mockResolvedValue({ id: 8 }),
      deleteNFCCard: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    usersService = { findOne: jest.fn().mockResolvedValue(mockUser) };
    resourceUsageService = { canControllResource: jest.fn().mockResolvedValue(true) };
    resourceIntroducersService = { isIntroducer: jest.fn().mockResolvedValue(false) };
    metricsService = { attractapNfcTapsTotal: { inc: jest.fn() } };
    // Default: a resource that does not support supervision (introduction_required).
    resourceRepository = { findOne: jest.fn().mockResolvedValue({ id: 10, supervisionMode: 'introduction_required' }) };
    rbacService = { getEffectivePermissions: jest.fn().mockResolvedValue(new Set<string>()) };
    audit = { recordAttractap: jest.fn().mockResolvedValue(undefined) };

    (handler as any).resourceListService = { sendResourceListToSocket: jest.fn().mockResolvedValue(undefined) };
    (handler as any).websocketService = websocketService;
    (handler as any).attractapService = attractapService;
    (handler as any).usersService = usersService;
    (handler as any).resourceUsageService = resourceUsageService;
    (handler as any).resourceIntroducersService = resourceIntroducersService;
    (handler as any).metricsService = metricsService;
    (handler as any).resourceRepository = resourceRepository;
    (handler as any).rbacService = rbacService;
    (handler as any).audit = audit;
  });
  return {
    get handler() {
      return handler;
    },
    get websocketService() {
      return websocketService;
    },
    get attractapService() {
      return attractapService;
    },
    get usersService() {
      return usersService;
    },
    get resourceUsageService() {
      return resourceUsageService;
    },
    get resourceIntroducersService() {
      return resourceIntroducersService;
    },
    get metricsService() {
      return metricsService;
    },
    get resourceRepository() {
      return resourceRepository;
    },
    get rbacService() {
      return rbacService;
    },
    get audit() {
      return audit;
    },
    get mockUser() {
      return mockUser;
    },
    get createMockSocket() {
      return createMockSocket;
    },
  };
}
