/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapCardHandler } from '../card.handler';
import { AttractapCardHandlerTestScope } from '../card.handler.spec';
export function resetTestFixture(scope: AttractapCardHandlerTestScope) {
  scope.handler = Object.create(AttractapCardHandler.prototype);
  (scope.handler as any).logger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  scope.websocketService = { sockets: new Map() };
  scope.attractapService = {
    findReaderById: jest.fn().mockResolvedValue(scope.mockReaderWithEnrollment),
    getNFCCardByUID: jest.fn().mockResolvedValue(null),
    getNFCCardByID: jest
      .fn()
      .mockResolvedValue({ id: 7, key: 'aabbccddeeff00112233445566778899', keyNo: 1, user: scope.mockUser }),
    generateNTAG424Key: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    uint8ArrayToHexString: jest.fn().mockReturnValue('deadbeef'),
    createNFCCard: jest.fn().mockResolvedValue({ id: 8 }),
    deleteNFCCard: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  scope.usersService = { findOne: jest.fn().mockResolvedValue(scope.mockUser) };
  scope.resourceUsageService = { canControllResource: jest.fn().mockResolvedValue(true) };
  scope.resourceIntroducersService = { isIntroducer: jest.fn().mockResolvedValue(false) };
  scope.metricsService = { attractapNfcTapsTotal: { inc: jest.fn() } };
  // Default: a resource that does not support supervision (introduction_required).
  scope.resourceRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 10, supervisionMode: 'introduction_required' }),
  };
  scope.rbacService = { getEffectivePermissions: jest.fn().mockResolvedValue(new Set<string>()) };
  scope.audit = { recordAttractap: jest.fn().mockResolvedValue(undefined) };

  (scope.handler as any).resourceListService = { sendResourceListToSocket: jest.fn().mockResolvedValue(undefined) };
  (scope.handler as any).websocketService = scope.websocketService;
  (scope.handler as any).attractapService = scope.attractapService;
  (scope.handler as any).usersService = scope.usersService;
  (scope.handler as any).resourceUsageService = scope.resourceUsageService;
  (scope.handler as any).resourceIntroducersService = scope.resourceIntroducersService;
  (scope.handler as any).metricsService = scope.metricsService;
  (scope.handler as any).resourceRepository = scope.resourceRepository;
  (scope.handler as any).rbacService = scope.rbacService;
  (scope.handler as any).audit = scope.audit;
}
