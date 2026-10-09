/* eslint-disable @typescript-eslint/no-explicit-any */

import { ResourceFormAction } from '@attraccess/database-entities';
import { InsufficientBalanceError } from './../../../billing/errors/insufficient-balance.error';
import { ResourceInUseError } from './../../../resources/usage/errors/resource-in-use.error';
import { inheritTestScope } from './../../../test-utils/inherit-test-scope';
import { AttractapEvent, AttractapEventType } from './../websocket.types';
import { ResourceActionGuard } from './resource-action.guard';
import { AttractapSessionHandler } from './session.handler';
import { resetTestFixture } from './session.handler.setup.test-fixture';
import { createHandleStartResourceUsageSessionFixture } from './session.handler.spec.createHandleStartResourceUsageSessionFixture.test-fixture';
import { createHandleStopResourceUsageSessionFixture } from './session.handler.spec.createHandleStopResourceUsageSessionFixture.test-fixture';
import { createLiveUsageStatsFixture } from './session.handler.spec.createLiveUsageStatsFixture.test-fixture';

describe('AttractapSessionHandler – session + flow button', () => {
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
    const fixture = createHandleStartResourceUsageSessionFixture(scope);

    it('returns early and does not start a session when the guard rejects the action', async () => {
      fixture.mockResourceActionGuard.validateResourceAction.mockResolvedValueOnce(false);

      await (fixture.handler as any).handleStartResourceUsageSession(fixture.mockSocket, fixture.eventData);

      expect(fixture.mockResourceActionGuard.validateResourceAction).toHaveBeenCalledWith(
        fixture.mockSocket,
        10,
        AttractapEventType.START_RESOURCE_USAGE_SESSION,
        undefined,
      );
      expect(fixture.mockFormsHandler.ensureFormsSatisfied).not.toHaveBeenCalled();
      expect(fixture.mockResourceUsageService.startSession).not.toHaveBeenCalled();
      expect(fixture.mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('returns early when forms are not satisfied (ensureFormsSatisfied returns null)', async () => {
      fixture.mockFormsHandler.ensureFormsSatisfied.mockResolvedValueOnce(null);

      await (fixture.handler as any).handleStartResourceUsageSession(fixture.mockSocket, fixture.eventData);

      expect(fixture.mockFormsHandler.ensureFormsSatisfied).toHaveBeenCalledWith({
        socket: fixture.mockSocket,
        resourceId: 10,
        action: ResourceFormAction.START,
      });
      expect(fixture.mockUsersService.findOne).not.toHaveBeenCalled();
      expect(fixture.mockResourceUsageService.startSession).not.toHaveBeenCalled();
      expect(fixture.mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('sends USER_NOT_FOUND when the authenticated user does not exist', async () => {
      fixture.mockUsersService.findOne.mockResolvedValueOnce(null);

      await (fixture.handler as any).handleStartResourceUsageSession(fixture.mockSocket, fixture.eventData);

      expect(fixture.mockUsersService.findOne).toHaveBeenCalledWith({ id: 1 });
      expect(fixture.mockResourceUsageService.startSession).not.toHaveBeenCalled();
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
            payload: { error: 'USER_NOT_FOUND' },
          }),
        }),
      );
    });

    it('starts the session, clears the form draft and sends success', async () => {
      const formSubmissions = [{ id: 99 }];
      fixture.mockFormsHandler.ensureFormsSatisfied.mockResolvedValueOnce(formSubmissions);

      await (fixture.handler as any).handleStartResourceUsageSession(fixture.mockSocket, fixture.eventData);

      expect(fixture.mockResourceUsageService.startSession).toHaveBeenCalledWith(
        10,
        fixture.mockUser,
        { projectId: 7, formSubmissions },
        { auditOrigin: { actorId: 1, authenticationMethod: null } },
      );
      expect(fixture.mockFormsHandler.clearFormDraft).toHaveBeenCalledWith(
        fixture.mockSocket,
        10,
        ResourceFormAction.START,
      );
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
            payload: { success: true },
          }),
        }),
      );
    });

    it('attaches the supervisor and settles the web request for a two-card supervised start', async () => {
      (fixture.mockSocket.state as any).supervisionFlow = {
        resourceId: 10,
        requesterUserId: 1,
        requestId: 'req-1',
        approvedSupervisorUserId: 2,
      };

      await (fixture.handler as any).handleStartResourceUsageSession(fixture.mockSocket, fixture.eventData);

      expect(fixture.mockResourceUsageService.startSession).toHaveBeenCalledWith(
        10,
        fixture.mockUser,
        { projectId: 7, formSubmissions: [] },
        { supervisorUserId: 2, auditOrigin: { actorId: 1, authenticationMethod: null } },
      );
      expect(fixture.mockSupervisionService.settleByCard).toHaveBeenCalledWith('req-1');
      expect((fixture.mockSocket.state as any).supervisionFlow).toBeNull();
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
            payload: { success: true },
          }),
        }),
      );
    });

    it('echoes the originating request id on success and error', async () => {
      const request = {
        ...fixture.eventData,
        payload: { ...fixture.eventData.payload, requestId: 880 },
      };
      await fixture.handler.handleStartResourceUsageSession(fixture.mockSocket, request);
      expect(fixture.mockSocket.sendMessage.mock.calls.at(-1)[0].data.payload).toMatchObject({
        success: true,
        requestId: 880,
      });
      expect(fixture.mockFormsHandler.ensureFormsSatisfied).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 880 }),
      );
      fixture.mockResourceUsageService.startSession.mockRejectedValueOnce(new Error('Start failed'));
      await fixture.handler.handleStartResourceUsageSession(fixture.mockSocket, {
        ...request,
        payload: { ...request.payload, requestId: 881 },
      });
      expect(fixture.mockSocket.sendMessage.mock.calls.at(-1)[0].data.payload).toMatchObject({
        error: 'Start failed',
        requestId: 881,
      });
    });

    describe('ResourceInUseError handling', () => {
      const resourceInUseErrorHandlingScope = inheritTestScope(
        {
          get parentScope() {
            return fixture;
          },
          get eventData() {
            return fixture.eventData;
          },
        },
        fixture,
      );

      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('reports the occupied resource immediately and refreshes the list', async () => {
        resourceInUseErrorHandlingScope.parentScope.mockResourceUsageService.startSession.mockRejectedValueOnce(
          new ResourceInUseError(),
        );

        await (resourceInUseErrorHandlingScope.parentScope.handler as any).handleStartResourceUsageSession(
          resourceInUseErrorHandlingScope.parentScope.mockSocket,
          resourceInUseErrorHandlingScope.eventData,
        );

        expect(resourceInUseErrorHandlingScope.parentScope.mockSocket.sendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
              payload: expect.objectContaining({ error: 'ResourceInUseError' }),
            }),
          }),
        );
        expect(resourceInUseErrorHandlingScope.parentScope.mockFormsHandler.clearFormDraft).not.toHaveBeenCalled();
        expect(
          resourceInUseErrorHandlingScope.parentScope.mockResourceListService.sendResourceListToSocket,
        ).toHaveBeenCalledWith(resourceInUseErrorHandlingScope.parentScope.mockSocket, {
          resourceIds: new Set([10]),
        });
      });
    });

    it('sends INSUFFICIENT_BALANCE with sumUpEnabled for InsufficientBalanceError', async () => {
      fixture.mockResourceUsageService.startSession.mockRejectedValueOnce(new InsufficientBalanceError());
      fixture.mockSumUpService.getIsEnabled.mockResolvedValueOnce(true);

      await (fixture.handler as any).handleStartResourceUsageSession(fixture.mockSocket, fixture.eventData);

      expect(fixture.mockSumUpService.getIsEnabled).toHaveBeenCalled();
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
            payload: { error: 'INSUFFICIENT_BALANCE', sumUpEnabled: true },
          }),
        }),
      );
    });

    it('sends INSUFFICIENT_BALANCE for a plain error whose message is INSUFFICIENT_BALANCE', async () => {
      fixture.mockResourceUsageService.startSession.mockRejectedValueOnce(new Error('INSUFFICIENT_BALANCE'));
      fixture.mockSumUpService.getIsEnabled.mockResolvedValueOnce(false);

      await (fixture.handler as any).handleStartResourceUsageSession(fixture.mockSocket, fixture.eventData);

      expect(fixture.mockSumUpService.getIsEnabled).toHaveBeenCalled();
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
            payload: { error: 'INSUFFICIENT_BALANCE', sumUpEnabled: false },
          }),
        }),
      );
    });

    it('sends the raw error message and logs for any other error', async () => {
      fixture.mockResourceUsageService.startSession.mockRejectedValueOnce(new Error('boom'));

      await (fixture.handler as any).handleStartResourceUsageSession(fixture.mockSocket, fixture.eventData);

      expect(fixture.mockSumUpService.getIsEnabled).not.toHaveBeenCalled();
      expect((fixture.handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to start resource usage session'),
      );
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
            payload: { error: 'boom' },
          }),
        }),
      );
    });
  });

  describe('handleStopResourceUsageSession', () => {
    const fixture = createHandleStopResourceUsageSessionFixture(scope);

    it('sends the final charge with configured precision and the action request ID', async () => {
      fixture.mockResourceUsageService.endSession.mockResolvedValue({
        id: 99,
        userId: 1,
        startTime: new Date(0),
        endTime: new Date(1426999),
      });
      fixture.mockBillingService.getResourceUsageCharge.mockResolvedValue({
        amount: -1234,
      });
      fixture.mockBillingService.getConfiguration.mockResolvedValue({
        currency: 'KWD',
        minorUnit: 3,
      });
      await fixture.handler.handleStopResourceUsageSession(
        fixture.mockSocket as any,
        {
          payload: { resourceId: 10, requestId: 5 },
        } as AttractapEvent['data'],
      );
      expect(fixture.mockBillingService.getResourceUsageCharge).toHaveBeenCalledWith(99, 1);
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payload: {
              success: true,
              requestId: 5,
              endedOwnSession: true,
              durationSeconds: 1426,
              billingSummary: { amount: 1234, total: '1,234 KWD' },
            },
          }),
        }),
      );
    });

    it.each([null, { amount: 0 }])('omits the summary for an absent or zero charge (%p)', async (charge) => {
      fixture.mockBillingService.getResourceUsageCharge.mockResolvedValue(charge);
      await fixture.handler.handleStopResourceUsageSession(
        fixture.mockSocket as any,
        {
          payload: { resourceId: 10 },
        } as AttractapEvent['data'],
      );
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ payload: { success: true, endedOwnSession: true } }),
        }),
      );
      expect(fixture.mockBillingService.getConfiguration).not.toHaveBeenCalled();
    });

    it.each([
      [0, 0],
      [999, 0],
      [1426999, 1426],
      [100 * 3600000, 360000],
      [-1000, 0],
    ])('uses committed timestamps for elapsed duration (%i ms)', async (elapsed, seconds) => {
      fixture.mockResourceUsageService.endSession.mockResolvedValue({
        id: 99,
        userId: 1,
        startTime: new Date(0),
        endTime: new Date(elapsed),
      });
      fixture.mockBillingService.getResourceUsageCharge.mockRejectedValue(new Error('billing unavailable'));
      await fixture.handler.handleStopResourceUsageSession(
        fixture.mockSocket as any,
        {
          payload: { resourceId: 10, requestId: 8 },
        } as AttractapEvent['data'],
      );
      expect(fixture.mockSocket.sendMessage.mock.calls[0][0].data.payload).toEqual({
        success: true,
        endedOwnSession: true,
        durationSeconds: seconds,
        requestId: 8,
      });
      expect(fixture.mockResourceUsageService.getActiveSession).not.toHaveBeenCalled();
    });

    it.each([null, undefined, new Date(NaN)])('omits unavailable duration (%p)', async (endTime) => {
      fixture.mockResourceUsageService.endSession.mockResolvedValue({
        id: 99,
        userId: 1,
        startTime: new Date(0),
        endTime,
      });
      await fixture.handler.handleStopResourceUsageSession(
        fixture.mockSocket as any,
        {
          payload: { resourceId: 10 },
        } as AttractapEvent['data'],
      );
      expect(fixture.mockSocket.sendMessage.mock.calls[0][0].data.payload).toEqual({
        success: true,
        endedOwnSession: true,
      });
    });

    it('does not expose another user’s charge when an administrator ends their session', async () => {
      fixture.mockResourceUsageService.endSession.mockResolvedValue({ id: 99, userId: 2 });
      await fixture.handler.handleStopResourceUsageSession(
        fixture.mockSocket as any,
        {
          payload: { resourceId: 10 },
        } as AttractapEvent['data'],
      );
      expect(fixture.mockBillingService.getResourceUsageCharge).not.toHaveBeenCalled();
      expect(fixture.mockSocket.sendMessage.mock.calls[0][0].data.payload).toEqual({
        success: true,
        endedOwnSession: false,
      });
    });

    it('keeps the action successful if the receipt lookup fails after ending the session', async () => {
      fixture.mockBillingService.getResourceUsageCharge.mockRejectedValue(new Error('billing unavailable'));
      await fixture.handler.handleStopResourceUsageSession(
        fixture.mockSocket as any,
        {
          payload: { resourceId: 10 },
        } as AttractapEvent['data'],
      );
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ payload: { success: true, endedOwnSession: true } }),
        }),
      );
    });

    it('returns early and does not end a session when the guard rejects the action', async () => {
      fixture.mockResourceActionGuard.validateResourceAction.mockResolvedValueOnce(false);

      await (fixture.handler as any).handleStopResourceUsageSession(fixture.mockSocket, fixture.eventData);

      expect(fixture.mockResourceActionGuard.validateResourceAction).toHaveBeenCalledWith(
        fixture.mockSocket,
        10,
        AttractapEventType.STOP_RESOURCE_USAGE_SESSION,
        undefined,
      );
      expect(fixture.mockFormsHandler.ensureFormsSatisfied).not.toHaveBeenCalled();
      expect(fixture.mockResourceUsageService.endSession).not.toHaveBeenCalled();
      expect(fixture.mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('returns early when forms are not satisfied (ensureFormsSatisfied returns null)', async () => {
      fixture.mockFormsHandler.ensureFormsSatisfied.mockResolvedValueOnce(null);

      await (fixture.handler as any).handleStopResourceUsageSession(fixture.mockSocket, fixture.eventData);

      expect(fixture.mockFormsHandler.ensureFormsSatisfied).toHaveBeenCalledWith({
        socket: fixture.mockSocket,
        resourceId: 10,
        action: ResourceFormAction.END,
      });
      expect(fixture.mockUsersService.findOne).not.toHaveBeenCalled();
      expect(fixture.mockResourceUsageService.endSession).not.toHaveBeenCalled();
      expect(fixture.mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('sends USER_NOT_FOUND when the authenticated user does not exist', async () => {
      fixture.mockUsersService.findOne.mockResolvedValueOnce(null);

      await (fixture.handler as any).handleStopResourceUsageSession(fixture.mockSocket, fixture.eventData);

      expect(fixture.mockResourceUsageService.endSession).not.toHaveBeenCalled();
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.STOP_RESOURCE_USAGE_SESSION,
            payload: { error: 'USER_NOT_FOUND' },
          }),
        }),
      );
    });

    it('ends the session, clears the form draft and sends success', async () => {
      const formSubmissions = [{ id: 5 }];
      fixture.mockFormsHandler.ensureFormsSatisfied.mockResolvedValueOnce(formSubmissions);

      await (fixture.handler as any).handleStopResourceUsageSession(fixture.mockSocket, fixture.eventData);

      expect(fixture.mockResourceUsageService.endSession).toHaveBeenCalledWith(
        10,
        fixture.mockUser,
        { formSubmissions },
        {
          auditOrigin: { actorId: 1, authenticationMethod: null },
        },
      );
      expect(fixture.mockFormsHandler.clearFormDraft).toHaveBeenCalledWith(
        fixture.mockSocket,
        10,
        ResourceFormAction.END,
      );
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.STOP_RESOURCE_USAGE_SESSION,
            payload: { success: true, endedOwnSession: true },
          }),
        }),
      );
    });

    it('sends the error message and logs when ending the session fails', async () => {
      fixture.mockResourceUsageService.endSession.mockRejectedValueOnce(new Error('stop failed'));

      await (fixture.handler as any).handleStopResourceUsageSession(fixture.mockSocket, fixture.eventData);

      expect((fixture.handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to stop resource usage session'),
      );
      expect(fixture.mockFormsHandler.clearFormDraft).not.toHaveBeenCalled();
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.STOP_RESOURCE_USAGE_SESSION,
            payload: { error: 'stop failed' },
          }),
        }),
      );
    });
  });

  describe('handleTriggerFlowButton', () => {
    const eventData = { payload: { resourceId: 10, buttonId: 'btn-1' } } as AttractapEvent['data'];
    const handleTriggerFlowButtonScope = inheritTestScope(
      {
        get mockResourceActionGuard() {
          return scope.mockResourceActionGuard;
        },
        set mockResourceActionGuard(value: typeof scope.mockResourceActionGuard) {
          scope.mockResourceActionGuard = value;
        },
        get handler() {
          return scope.handler;
        },
        set handler(value: typeof scope.handler) {
          scope.handler = value;
        },
        get mockSocket() {
          return scope.mockSocket;
        },
        set mockSocket(value: typeof scope.mockSocket) {
          scope.mockSocket = value;
        },
        get eventData() {
          return eventData;
        },
        get mockResourceFlowsExecutorService() {
          return scope.mockResourceFlowsExecutorService;
        },
        set mockResourceFlowsExecutorService(value: typeof scope.mockResourceFlowsExecutorService) {
          scope.mockResourceFlowsExecutorService = value;
        },
      },
      scope,
    );

    it('returns early and does not press the button when the guard rejects the action', async () => {
      handleTriggerFlowButtonScope.mockResourceActionGuard.validateResourceAction.mockResolvedValueOnce(false);

      await (handleTriggerFlowButtonScope.handler as any).handleTriggerFlowButton(
        handleTriggerFlowButtonScope.mockSocket,
        handleTriggerFlowButtonScope.eventData,
      );

      expect(handleTriggerFlowButtonScope.mockResourceActionGuard.validateResourceAction).toHaveBeenCalledWith(
        handleTriggerFlowButtonScope.mockSocket,
        10,
        AttractapEventType.TRIGGER_FLOW_BUTTON,
        undefined,
      );
      expect(handleTriggerFlowButtonScope.mockResourceFlowsExecutorService.pressButton).not.toHaveBeenCalled();
      expect(handleTriggerFlowButtonScope.mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('presses the button and sends success', async () => {
      await (handleTriggerFlowButtonScope.handler as any).handleTriggerFlowButton(
        handleTriggerFlowButtonScope.mockSocket,
        handleTriggerFlowButtonScope.eventData,
      );

      expect(handleTriggerFlowButtonScope.mockResourceFlowsExecutorService.pressButton).toHaveBeenCalledWith(
        10,
        'btn-1',
        1,
      );
      expect(handleTriggerFlowButtonScope.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.TRIGGER_FLOW_BUTTON,
            payload: { success: true },
          }),
        }),
      );
    });

    it('sends the error message and logs when pressing the button fails', async () => {
      handleTriggerFlowButtonScope.mockResourceFlowsExecutorService.pressButton.mockRejectedValueOnce(
        new Error('flow boom'),
      );

      await (handleTriggerFlowButtonScope.handler as any).handleTriggerFlowButton(
        handleTriggerFlowButtonScope.mockSocket,
        handleTriggerFlowButtonScope.eventData,
      );

      expect((handleTriggerFlowButtonScope.handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to trigger flow button'),
      );
      expect(handleTriggerFlowButtonScope.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.TRIGGER_FLOW_BUTTON,
            payload: { error: 'flow boom' },
          }),
        }),
      );
    });
  });
  describe('live usage stats', () => {
    const liveUsageStatsScope = createLiveUsageStatsFixture(scope);
    beforeEach(() => {
      scope.mockResourceUsageService.getActiveSession.mockResolvedValue({
        id: 99,
        userId: 1,
        startTime: liveUsageStatsScope.startTime,
      });
      scope.metering.getLive.mockResolvedValue({
        meters: [
          {
            id: 1,
            name: 'Renamed Heartbeats',
            creditsPerUnit: 100,
            session: { usageId: 99, meterName: 'Heartbeats', creditsPerUnit: 2, latestValue: '0.125' },
          },
        ],
      });
      scope.operating.getForResource.mockResolvedValue({
        operatingDataAvailable: true,
        isOperating: true,
        attributions: [
          { usageId: 99, durationMs: 120000 },
          { usageId: 98, durationMs: 80000 },
        ],
      });
    });

    it('returns captured meter names and rates after edits, with operating time attributed to the current usage', async () => {
      await liveUsageStatsScope.handler.handleResourceUsageStats(
        liveUsageStatsScope.mockSocket as any,
        liveUsageStatsScope.request,
      );
      expect(liveUsageStatsScope.operating.getForResource).toHaveBeenCalledWith(
        10,
        expect.any(Date),
        liveUsageStatsScope.startTime,
      );
      expect(liveUsageStatsScope.mockSocket.sendMessage).toHaveBeenCalledWith(
        new AttractapEvent(AttractapEventType.RESOURCE_USAGE_STATS, {
          resourceId: 10,
          requestId: 7,
          usage: {
            id: 99,
            meters: [{ id: 1, name: 'Heartbeats', creditsPerUnit: 2, formattedRate: '0,02 EUR', value: '0.125' }],
            operatingDurationMs: 120000,
            isOperating: true,
          },
        }),
      );
    });

    it('formats the captured rate using the configured currency precision', async () => {
      liveUsageStatsScope.mockBillingService.getConfiguration.mockResolvedValue({ currency: 'KWD', minorUnit: 3 });
      await liveUsageStatsScope.handler.handleResourceUsageStats(
        liveUsageStatsScope.mockSocket as any,
        liveUsageStatsScope.request,
      );
      expect(liveUsageStatsScope.mockSocket.sendMessage.mock.calls[0][0].data.payload.usage.meters[0]).toMatchObject({
        name: 'Heartbeats',
        creditsPerUnit: 2,
        formattedRate: '0,002 KWD',
      });
    });

    it('keeps a skipped free meter unavailable with its captured name and zero rate after edits', async () => {
      liveUsageStatsScope.metering.getLive.mockResolvedValue({
        meters: [
          {
            id: 1,
            name: 'Renamed Heartbeats',
            creditsPerUnit: 100,
            session: {
              sessionId: null,
              usageId: 99,
              meterName: 'Heartbeats',
              creditsPerUnit: 0,
              latestValue: null,
            },
          },
        ],
      });
      await liveUsageStatsScope.handler.handleResourceUsageStats(
        liveUsageStatsScope.mockSocket as any,
        liveUsageStatsScope.request,
      );
      expect(liveUsageStatsScope.mockSocket.sendMessage.mock.calls[0][0].data.payload.usage.meters).toEqual([
        { id: 1, name: 'Heartbeats', creditsPerUnit: 0, formattedRate: '0,00 EUR', value: null },
      ]);
    });

    it('keeps unavailable readings distinct from zero and discards a different meter session', async () => {
      liveUsageStatsScope.metering.getLive.mockResolvedValue({
        meters: [{ id: 1, name: 'Heartbeats', session: { usageId: 100, latestValue: '9' } }],
      });
      liveUsageStatsScope.operating.getForResource.mockResolvedValue({
        operatingDataAvailable: false,
        attributions: [],
      });
      await liveUsageStatsScope.handler.handleResourceUsageStats(
        liveUsageStatsScope.mockSocket as any,
        liveUsageStatsScope.request,
      );
      expect(liveUsageStatsScope.mockSocket.sendMessage.mock.calls[0][0].data.payload.usage).toEqual({
        id: 99,
        meters: [],
        operatingDurationMs: null,
        isOperating: null,
      });
    });

    it('returns multiple named meters, preserving zero and unavailable values', async () => {
      liveUsageStatsScope.metering.getLive.mockResolvedValue({
        meters: [
          {
            id: 1,
            name: 'Energy (kWh)',
            session: { usageId: 99, meterName: 'Energy (kWh)', creditsPerUnit: 0, latestValue: '0' },
          },
          {
            id: 2,
            name: 'Heartbeats',
            session: {
              usageId: 99,
              meterName: 'Heartbeats',
              creditsPerUnit: Number.MAX_SAFE_INTEGER,
              latestValue: '9007199254740993.125',
            },
          },
          {
            id: 3,
            name: 'Water',
            session: { usageId: 99, meterName: 'Water', creditsPerUnit: 100, latestValue: null },
          },
          { id: 4, name: 'Other usage', session: { usageId: 100, latestValue: '9' } },
          { id: 5, name: 'Idle meter', session: null },
        ],
      });
      await liveUsageStatsScope.handler.handleResourceUsageStats(
        liveUsageStatsScope.mockSocket as any,
        liveUsageStatsScope.request,
      );
      expect(liveUsageStatsScope.mockSocket.sendMessage.mock.calls[0][0].data.payload.usage.meters).toEqual([
        { id: 1, name: 'Energy (kWh)', creditsPerUnit: 0, formattedRate: '0,00 EUR', value: '0' },
        {
          id: 2,
          name: 'Heartbeats',
          creditsPerUnit: Number.MAX_SAFE_INTEGER,
          formattedRate: '90.071.992.547.409,91 EUR',
          value: '9007199254740993.125',
        },
        { id: 3, name: 'Water', creditsPerUnit: 100, formattedRate: '1,00 EUR', value: null },
      ]);
    });

    it.each([null, { id: 99, userId: 2, startTime: liveUsageStatsScope.startTime }])(
      'does not expose readings without an owned session (%p)',
      async (usage) => {
        liveUsageStatsScope.mockResourceUsageService.getActiveSession.mockResolvedValue(usage);
        await liveUsageStatsScope.handler.handleResourceUsageStats(
          liveUsageStatsScope.mockSocket as any,
          liveUsageStatsScope.request,
        );
        expect(liveUsageStatsScope.mockSocket.sendMessage.mock.calls[0][0].data.payload.usage).toBeNull();
        expect(liveUsageStatsScope.metering.getLive).not.toHaveBeenCalled();
      },
    );

    it('does not query when the reader/card guard rejects the request', async () => {
      liveUsageStatsScope.mockResourceActionGuard.validateResourceAction.mockResolvedValue(false);
      await liveUsageStatsScope.handler.handleResourceUsageStats(
        liveUsageStatsScope.mockSocket as any,
        liveUsageStatsScope.request,
      );
      expect(liveUsageStatsScope.mockResourceUsageService.getActiveSession).not.toHaveBeenCalled();
    });

    describe('reader access with the actual resource guard', () => {
      let reader: { id: number; resources: { id: number }[] };
      const readerAccessWithTheActualResourceGuardScope = inheritTestScope(
        {
          get parentScope() {
            return liveUsageStatsScope;
          },
          get reader() {
            return reader;
          },
          set reader(value: typeof reader) {
            reader = value;
          },
          get request() {
            return liveUsageStatsScope.request;
          },
        },
        liveUsageStatsScope,
      );
      beforeEach(() => {
        reader = { id: 42, resources: [{ id: 10 }] };
        (liveUsageStatsScope.handler as any).resourceActionGuard = Object.assign(new ResourceActionGuard(), {
          attractapService: { findReaderById: jest.fn(async () => reader) },
          usersService: liveUsageStatsScope.mockUsersService,
        });
      });

      it.each(['USER_NOT_AUTHENTICATED', 'RESOURCE_NOT_ASSOCIATED_WITH_READER'])(
        'rejects %s without looking up or disclosing readings',
        async (error) => {
          if (error === 'USER_NOT_AUTHENTICATED')
            (readerAccessWithTheActualResourceGuardScope.parentScope.mockSocket.state as any).lastAuthenticatedUserId =
              null;
          else readerAccessWithTheActualResourceGuardScope.reader.resources = [];
          await readerAccessWithTheActualResourceGuardScope.parentScope.handler.handleResourceUsageStats(
            readerAccessWithTheActualResourceGuardScope.parentScope.mockSocket as any,
            readerAccessWithTheActualResourceGuardScope.request,
          );
          expect(readerAccessWithTheActualResourceGuardScope.parentScope.mockSocket.sendMessage).toHaveBeenCalledWith(
            new AttractapEvent(AttractapEventType.RESOURCE_USAGE_STATS, { requestId: 7, error }),
          );
          expect(
            readerAccessWithTheActualResourceGuardScope.parentScope.mockResourceUsageService.getActiveSession,
          ).not.toHaveBeenCalled();
          expect(readerAccessWithTheActualResourceGuardScope.parentScope.metering.getLive).not.toHaveBeenCalled();
          expect(
            readerAccessWithTheActualResourceGuardScope.parentScope.operating.getForResource,
          ).not.toHaveBeenCalled();
        },
      );

      it('allows an authenticated session owner on a mapped resource', async () => {
        await readerAccessWithTheActualResourceGuardScope.parentScope.handler.handleResourceUsageStats(
          readerAccessWithTheActualResourceGuardScope.parentScope.mockSocket as any,
          readerAccessWithTheActualResourceGuardScope.request,
        );
        expect(readerAccessWithTheActualResourceGuardScope.parentScope.metering.getLive).toHaveBeenCalledWith(10);
        expect(
          readerAccessWithTheActualResourceGuardScope.parentScope.mockSocket.sendMessage.mock.calls[0][0].data.payload
            .usage,
        ).toMatchObject({
          id: 99,
          meters: [{ id: 1, name: 'Heartbeats', creditsPerUnit: 2, formattedRate: '0,02 EUR', value: '0.125' }],
          operatingDurationMs: 120000,
        });
      });
    });

    it('discards results when the card changes during the lookup', async () => {
      liveUsageStatsScope.metering.getLive.mockImplementation(async () => {
        liveUsageStatsScope.mockSocket.state.lastAuthenticatedUserId = 2;
        return { meters: [] };
      });
      await liveUsageStatsScope.handler.handleResourceUsageStats(
        liveUsageStatsScope.mockSocket as any,
        liveUsageStatsScope.request,
      );
      expect(liveUsageStatsScope.mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('clears readings when the data service fails without failing the reader session', async () => {
      liveUsageStatsScope.metering.getLive.mockRejectedValue(new Error('database unavailable'));
      await liveUsageStatsScope.handler.handleResourceUsageStats(
        liveUsageStatsScope.mockSocket as any,
        liveUsageStatsScope.request,
      );
      expect(liveUsageStatsScope.mockSocket.sendMessage.mock.calls[0][0].data.payload.usage).toBeNull();
    });
  });
});

export type AttractapSessionHandlerSessionFlowButtonTestScope = {
  handler: AttractapSessionHandler;
  mockSocket: {
    id: string;
    readerId: number;
    state: { lastAuthenticatedUserId: number; readerId: number };
    sendMessage: jest.Mock;
    sendBinaryData: jest.Mock;
  };
  mockUsersService: { findOne: jest.Mock };
  mockResourceUsageService: { startSession: jest.Mock; endSession: jest.Mock; getActiveSession: jest.Mock };
  mockResourceFlowsExecutorService: { pressButton: jest.Mock };
  mockSumUpService: { getIsEnabled: jest.Mock };
  mockResourceActionGuard: { validateResourceAction: jest.Mock };
  mockResourceListService: { sendResourceListToSocket: jest.Mock };
  mockFormsHandler: { ensureFormsSatisfied: jest.Mock; clearFormDraft: jest.Mock };
  mockSupervisionService: { settleByCard: jest.Mock };
  mockBillingService: { getResourceUsageCharge: jest.Mock; getConfiguration: jest.Mock };
  metering: { getLive: any };
  operating: { getForResource: any };
  mockUser: { id: number; username: string };
};
export type LiveUsageStatsTestScope = ReturnType<typeof createLiveUsageStatsFixture>;
export type HandleStartResourceUsageSessionTestScope = ReturnType<typeof createHandleStartResourceUsageSessionFixture>;
export type HandleStopResourceUsageSessionTestScope = ReturnType<typeof createHandleStopResourceUsageSessionFixture>;
