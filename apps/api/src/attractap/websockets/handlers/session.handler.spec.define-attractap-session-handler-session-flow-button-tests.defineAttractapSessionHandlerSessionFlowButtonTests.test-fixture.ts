import { AttractapSessionHandler } from './session.handler';
import { resetTestFixture } from './session.handler.setup.test-fixture';
import { defineLiveUsageStatsTests } from './session.handler.spec.define-attractap-session-handler-session-flow-button-tests.defineLiveUsageStatsTests.test-fixture';
import { defineHandleStartResourceUsageSessionTests } from './session.handler.spec.define-attractap-session-handler-session-flow-button-tests.defineHandleStartResourceUsageSessionTests.test-fixture';
import { defineHandleStopResourceUsageSessionTests } from './session.handler.spec.define-attractap-session-handler-session-flow-button-tests.defineHandleStopResourceUsageSessionTests.test-fixture';
import { defineHandleTriggerFlowButtonTests } from './session.handler.spec.define-attractap-session-handler-session-flow-button-tests.defineHandleTriggerFlowButtonTests.test-fixture';

export function defineAttractapSessionHandlerSessionFlowButtonTests() {
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
  const scope = {
    get handler() {
      return handler;
    },
    set handler(value: typeof handler) {
      handler = value;
    },
    get mockSocket() {
      return mockSocket;
    },
    set mockSocket(value: typeof mockSocket) {
      mockSocket = value;
    },
    get mockUsersService() {
      return mockUsersService;
    },
    set mockUsersService(value: typeof mockUsersService) {
      mockUsersService = value;
    },
    get mockResourceUsageService() {
      return mockResourceUsageService;
    },
    set mockResourceUsageService(value: typeof mockResourceUsageService) {
      mockResourceUsageService = value;
    },
    get mockResourceFlowsExecutorService() {
      return mockResourceFlowsExecutorService;
    },
    set mockResourceFlowsExecutorService(value: typeof mockResourceFlowsExecutorService) {
      mockResourceFlowsExecutorService = value;
    },
    get mockSumUpService() {
      return mockSumUpService;
    },
    set mockSumUpService(value: typeof mockSumUpService) {
      mockSumUpService = value;
    },
    get mockResourceActionGuard() {
      return mockResourceActionGuard;
    },
    set mockResourceActionGuard(value: typeof mockResourceActionGuard) {
      mockResourceActionGuard = value;
    },
    get mockResourceListService() {
      return mockResourceListService;
    },
    set mockResourceListService(value: typeof mockResourceListService) {
      mockResourceListService = value;
    },
    get mockFormsHandler() {
      return mockFormsHandler;
    },
    set mockFormsHandler(value: typeof mockFormsHandler) {
      mockFormsHandler = value;
    },
    get mockSupervisionService() {
      return mockSupervisionService;
    },
    set mockSupervisionService(value: typeof mockSupervisionService) {
      mockSupervisionService = value;
    },
    get mockBillingService() {
      return mockBillingService;
    },
    set mockBillingService(value: typeof mockBillingService) {
      mockBillingService = value;
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

  beforeEach(() => {
    resetTestFixture(scope);
  });

  describe('handleStartResourceUsageSession', () => {
    defineHandleStartResourceUsageSessionTests(scope);
  });

  describe('handleStopResourceUsageSession', () => {
    defineHandleStopResourceUsageSessionTests(scope);
  });

  describe('handleTriggerFlowButton', () => {
    defineHandleTriggerFlowButtonTests(scope);
  });
  describe('live usage stats', () => {
    defineLiveUsageStatsTests(scope);
  });

  return scope;
}
