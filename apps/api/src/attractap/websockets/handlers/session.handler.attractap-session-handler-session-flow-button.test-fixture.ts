/* eslint-disable @typescript-eslint/no-explicit-any */
import { AttractapSessionHandler } from './session.handler';

export function registerAttractapSessionHandlerSessionFlowButtonFixture() {
  let handler: AttractapSessionHandler;

  let mockSocket: {
    id: string;
    readerId: number;
    state: { lastAuthenticatedUserId: number; readerId: number };
    sendMessage: jest.Mock;
    sendBinaryData: jest.Mock;
  };

  let mockUsersService: { findOne: jest.Mock };

  let mockResourceUsageService: { startSession: jest.Mock; endSession: jest.Mock; getActiveSession: jest.Mock };

  let mockResourceFlowsExecutorService: { pressButton: jest.Mock };

  let mockSumUpService: { getIsEnabled: jest.Mock };

  let mockResourceActionGuard: { validateResourceAction: jest.Mock };

  let mockResourceListService: { sendResourceListToSocket: jest.Mock };

  let mockFormsHandler: { ensureFormsSatisfied: jest.Mock; clearFormDraft: jest.Mock };

  let mockSupervisionService: { settleByCard: jest.Mock };

  let mockBillingService: { getResourceUsageCharge: jest.Mock; getConfiguration: jest.Mock };

  const metering = { getLive: jest.fn() };

  const operating = { getForResource: jest.fn() };

  const mockUser = { id: 1, username: 'testuser' };

  beforeEach(() => {
    handler = Object.create(AttractapSessionHandler.prototype);
    (handler as any).logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    mockSocket = {
      id: 'sock-1',
      readerId: 42,
      state: { lastAuthenticatedUserId: 1, readerId: 42 },
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendBinaryData: jest.fn(),
    };

    mockUsersService = {
      findOne: jest.fn().mockResolvedValue(mockUser),
    };

    mockResourceUsageService = {
      getActiveSession: jest.fn().mockResolvedValue(null),
      startSession: jest.fn().mockResolvedValue({}),
      endSession: jest.fn().mockResolvedValue({ id: 99, userId: 1 }),
    };

    mockResourceFlowsExecutorService = {
      pressButton: jest.fn().mockResolvedValue({}),
    };

    mockSumUpService = {
      getIsEnabled: jest.fn().mockResolvedValue(true),
    };

    mockResourceActionGuard = {
      validateResourceAction: jest.fn().mockResolvedValue(true),
    };

    mockResourceListService = {
      sendResourceListToSocket: jest.fn().mockResolvedValue(undefined),
    };

    mockFormsHandler = {
      ensureFormsSatisfied: jest.fn().mockResolvedValue([]),
      clearFormDraft: jest.fn(),
    };

    mockSupervisionService = {
      settleByCard: jest.fn(),
    };

    (handler as any).meteringService = metering;
    (handler as any).operatingAttributionService = operating;
    metering.getLive.mockReset();
    operating.getForResource.mockReset();
    (handler as any).usersService = mockUsersService;
    (handler as any).resourceUsageService = mockResourceUsageService;
    (handler as any).resourceFlowsExecutorService = mockResourceFlowsExecutorService;
    (handler as any).sumUpService = mockSumUpService;
    (handler as any).resourceActionGuard = mockResourceActionGuard;
    (handler as any).resourceListService = mockResourceListService;
    (handler as any).formsHandler = mockFormsHandler;
    (handler as any).supervisionService = mockSupervisionService;
    mockBillingService = {
      getResourceUsageCharge: jest.fn().mockResolvedValue(null),
      getConfiguration: jest.fn().mockResolvedValue({ currency: 'EUR', minorUnit: 2 }),
    };
    (handler as any).billingService = mockBillingService;
  });
  return {
    get handler() {
      return handler;
    },
    get mockSocket() {
      return mockSocket;
    },
    get mockUsersService() {
      return mockUsersService;
    },
    get mockResourceUsageService() {
      return mockResourceUsageService;
    },
    get mockResourceFlowsExecutorService() {
      return mockResourceFlowsExecutorService;
    },
    get mockSumUpService() {
      return mockSumUpService;
    },
    get mockResourceActionGuard() {
      return mockResourceActionGuard;
    },
    get mockResourceListService() {
      return mockResourceListService;
    },
    get mockFormsHandler() {
      return mockFormsHandler;
    },
    get mockSupervisionService() {
      return mockSupervisionService;
    },
    get mockBillingService() {
      return mockBillingService;
    },
    get metering() {
      return metering;
    },
    get operating() {
      return operating;
    },
    get mockUser() {
      return mockUser;
    },
  };
}
