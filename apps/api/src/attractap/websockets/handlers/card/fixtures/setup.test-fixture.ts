/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { SettingsService } from '../../../../../settings/settings.service';
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

  (scope.handler as any).settingsService = Object.assign(Object.create(SettingsService.prototype), {
    getDefaultLanguage: jest.fn().mockResolvedValue('en'),
  });
  (scope.handler as any).resourceListService = { sendResourceListToSocket: jest.fn().mockResolvedValue(undefined) };
  (scope.handler as any).websocketService = scope.websocketService;
  (scope.handler as any).attractapService = scope.attractapService;
  (scope.handler as any).usersService = scope.usersService;
  (scope.handler as any).resourceUsageService = scope.resourceUsageService;
  (scope.handler as any).resourceIntroducersService = scope.resourceIntroducersService;
  (scope.handler as any).metricsService = scope.metricsService;
  (scope.handler as any).resourceRepository = scope.resourceRepository;
  (scope.handler as any).rbacService = scope.rbacService;
  (scope.handler as any).cardOperations = {
    // Card verification itself is covered by card-operations.service.spec.ts; here the card is
    // verified exactly when the stored card exists and is active.
    verifyCard: jest.fn(async (_socket: unknown, _purpose: string, uid: string) => {
      const card = await scope.attractapService.getNFCCardByUID(uid);
      if (!card) return { ok: false, error: 'CARD_NOT_FOUND' };
      if (!card.isActive) return { ok: false, error: 'CARD_NOT_ACTIVE' };
      return { ok: true, card };
    }),
    enroll: jest.fn().mockResolvedValue({ ok: true }),
    reset: jest.fn().mockResolvedValue({ ok: true }),
  };
  (scope.handler as any).cardWriterPolicy = { assertAllowed: jest.fn().mockResolvedValue(undefined) };
  // Specs written for the old request/response protocol still call this shape.
  (scope.handler as any).handleCardAuthenticationRequest = (socket: unknown, data: any) =>
    scope.handler.handleCardTap(socket as any, data.payload.uid, data.payload.resourceId);
}
