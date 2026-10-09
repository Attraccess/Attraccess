/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapSessionHandler } from '../session.handler';
import { AttractapSessionHandlerSessionFlowButtonTestScope } from '../session.handler.spec';
export function resetTestFixture(scope: AttractapSessionHandlerSessionFlowButtonTestScope) {
  scope.handler = Object.create(AttractapSessionHandler.prototype);
  (scope.handler as any).logger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  scope.mockSocket = {
    id: 'sock-1',
    readerId: 42,
    state: { lastAuthenticatedUserId: 1, readerId: 42 },
    sendMessage: jest.fn().mockResolvedValue(undefined),
    sendBinaryData: jest.fn(),
  };

  scope.mockUsersService = {
    findOne: jest.fn().mockResolvedValue(scope.mockUser),
  };

  scope.mockResourceUsageService = {
    getActiveSession: jest.fn().mockResolvedValue(null),
    startSession: jest.fn().mockResolvedValue({}),
    endSession: jest.fn().mockResolvedValue({ id: 99, userId: 1 }),
  };

  scope.mockResourceFlowsExecutorService = {
    pressButton: jest.fn().mockResolvedValue({}),
  };

  scope.mockSumUpService = {
    getIsEnabled: jest.fn().mockResolvedValue(true),
  };

  scope.mockResourceActionGuard = {
    validateResourceAction: jest.fn().mockResolvedValue(true),
  };

  scope.mockResourceListService = {
    sendResourceListToSocket: jest.fn().mockResolvedValue(undefined),
  };

  scope.mockFormsHandler = {
    ensureFormsSatisfied: jest.fn().mockResolvedValue([]),
    clearFormDraft: jest.fn(),
  };

  scope.mockSupervisionService = {
    settleByCard: jest.fn(),
  };

  (scope.handler as any).meteringService = scope.metering;
  (scope.handler as any).operatingAttributionService = scope.operating;
  scope.metering.getLive.mockReset();
  scope.operating.getForResource.mockReset();
  (scope.handler as any).usersService = scope.mockUsersService;
  (scope.handler as any).resourceUsageService = scope.mockResourceUsageService;
  (scope.handler as any).resourceFlowsExecutorService = scope.mockResourceFlowsExecutorService;
  (scope.handler as any).sumUpService = scope.mockSumUpService;
  (scope.handler as any).resourceActionGuard = scope.mockResourceActionGuard;
  (scope.handler as any).resourceListService = scope.mockResourceListService;
  (scope.handler as any).formsHandler = scope.mockFormsHandler;
  (scope.handler as any).supervisionService = scope.mockSupervisionService;
  scope.mockBillingService = {
    getResourceUsageCharge: jest.fn().mockResolvedValue(null),
    getConfiguration: jest.fn().mockResolvedValue({ currency: 'EUR', minorUnit: 2 }),
  };
  (scope.handler as any).billingService = scope.mockBillingService;
}
