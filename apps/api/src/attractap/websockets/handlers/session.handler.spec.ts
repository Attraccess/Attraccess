/* eslint-disable @typescript-eslint/no-explicit-any */
import { AttractapSessionHandler } from './session.handler';
import { AttractapEventType, AttractapEvent } from '../websocket.types';
import { ResourceInUseError } from '../../../resources/usage/errors/resource-in-use.error';
import { InsufficientBalanceError } from '../../../billing/errors/insufficient-balance.error';
import { ResourceFormAction } from '@attraccess/database-entities';
import { ResourceActionGuard } from './resource-action.guard';

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

  describe('handleStartResourceUsageSession', () => {
    const eventData = { payload: { resourceId: 10, projectId: 7 } } as AttractapEvent['data'];

    it('returns early and does not start a session when the guard rejects the action', async () => {
      mockResourceActionGuard.validateResourceAction.mockResolvedValueOnce(false);

      await (handler as any).handleStartResourceUsageSession(mockSocket, eventData);

      expect(mockResourceActionGuard.validateResourceAction).toHaveBeenCalledWith(
        mockSocket,
        10,
        AttractapEventType.START_RESOURCE_USAGE_SESSION,
        undefined,
      );
      expect(mockFormsHandler.ensureFormsSatisfied).not.toHaveBeenCalled();
      expect(mockResourceUsageService.startSession).not.toHaveBeenCalled();
      expect(mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('returns early when forms are not satisfied (ensureFormsSatisfied returns null)', async () => {
      mockFormsHandler.ensureFormsSatisfied.mockResolvedValueOnce(null);

      await (handler as any).handleStartResourceUsageSession(mockSocket, eventData);

      expect(mockFormsHandler.ensureFormsSatisfied).toHaveBeenCalledWith({
        socket: mockSocket,
        resourceId: 10,
        action: ResourceFormAction.START,
      });
      expect(mockUsersService.findOne).not.toHaveBeenCalled();
      expect(mockResourceUsageService.startSession).not.toHaveBeenCalled();
      expect(mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('sends USER_NOT_FOUND when the authenticated user does not exist', async () => {
      mockUsersService.findOne.mockResolvedValueOnce(null);

      await (handler as any).handleStartResourceUsageSession(mockSocket, eventData);

      expect(mockUsersService.findOne).toHaveBeenCalledWith({ id: 1 });
      expect(mockResourceUsageService.startSession).not.toHaveBeenCalled();
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
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
      mockFormsHandler.ensureFormsSatisfied.mockResolvedValueOnce(formSubmissions);

      await (handler as any).handleStartResourceUsageSession(mockSocket, eventData);

      expect(mockResourceUsageService.startSession).toHaveBeenCalledWith(
        10,
        mockUser,
        { projectId: 7, formSubmissions },
        { auditOrigin: { actorId: 1, authenticationMethod: null } },
      );
      expect(mockFormsHandler.clearFormDraft).toHaveBeenCalledWith(mockSocket, 10, ResourceFormAction.START);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
            payload: { success: true },
          }),
        }),
      );
    });

    it('attaches the supervisor and settles the web request for a two-card supervised start', async () => {
      (mockSocket.state as any).supervisionFlow = {
        resourceId: 10,
        requesterUserId: 1,
        requestId: 'req-1',
        approvedSupervisorUserId: 2,
      };

      await (handler as any).handleStartResourceUsageSession(mockSocket, eventData);

      expect(mockResourceUsageService.startSession).toHaveBeenCalledWith(
        10,
        mockUser,
        { projectId: 7, formSubmissions: [] },
        { supervisorUserId: 2, auditOrigin: { actorId: 1, authenticationMethod: null } },
      );
      expect(mockSupervisionService.settleByCard).toHaveBeenCalledWith('req-1');
      expect((mockSocket.state as any).supervisionFlow).toBeNull();
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
            payload: { success: true },
          }),
        }),
      );
    });

    it('echoes the originating request id on success and error', async () => {
      const request = { ...eventData, payload: { ...eventData.payload, requestId: 880 } };
      await handler.handleStartResourceUsageSession(mockSocket, request);
      expect(mockSocket.sendMessage.mock.calls.at(-1)[0].data.payload).toMatchObject({ success: true, requestId: 880 });
      expect(mockFormsHandler.ensureFormsSatisfied).toHaveBeenCalledWith(expect.objectContaining({ requestId: 880 }));
      mockResourceUsageService.startSession.mockRejectedValueOnce(new Error('Start failed'));
      await handler.handleStartResourceUsageSession(mockSocket, {
        ...request,
        payload: { ...request.payload, requestId: 881 },
      });
      expect(mockSocket.sendMessage.mock.calls.at(-1)[0].data.payload).toMatchObject({
        error: 'Start failed',
        requestId: 881,
      });
    });

    describe('ResourceInUseError handling', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('reports the occupied resource immediately and refreshes the list', async () => {
        mockResourceUsageService.startSession.mockRejectedValueOnce(new ResourceInUseError());

        await (handler as any).handleStartResourceUsageSession(mockSocket, eventData);

        expect(mockSocket.sendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
              payload: expect.objectContaining({ error: 'ResourceInUseError' }),
            }),
          }),
        );
        expect(mockFormsHandler.clearFormDraft).not.toHaveBeenCalled();
        expect(mockResourceListService.sendResourceListToSocket).toHaveBeenCalledWith(mockSocket, {
          resourceIds: new Set([10]),
        });
      });
    });

    it('sends INSUFFICIENT_BALANCE with sumUpEnabled for InsufficientBalanceError', async () => {
      mockResourceUsageService.startSession.mockRejectedValueOnce(new InsufficientBalanceError());
      mockSumUpService.getIsEnabled.mockResolvedValueOnce(true);

      await (handler as any).handleStartResourceUsageSession(mockSocket, eventData);

      expect(mockSumUpService.getIsEnabled).toHaveBeenCalled();
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
            payload: { error: 'INSUFFICIENT_BALANCE', sumUpEnabled: true },
          }),
        }),
      );
    });

    it('sends INSUFFICIENT_BALANCE for a plain error whose message is INSUFFICIENT_BALANCE', async () => {
      mockResourceUsageService.startSession.mockRejectedValueOnce(new Error('INSUFFICIENT_BALANCE'));
      mockSumUpService.getIsEnabled.mockResolvedValueOnce(false);

      await (handler as any).handleStartResourceUsageSession(mockSocket, eventData);

      expect(mockSumUpService.getIsEnabled).toHaveBeenCalled();
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
            payload: { error: 'INSUFFICIENT_BALANCE', sumUpEnabled: false },
          }),
        }),
      );
    });

    it('sends the raw error message and logs for any other error', async () => {
      mockResourceUsageService.startSession.mockRejectedValueOnce(new Error('boom'));

      await (handler as any).handleStartResourceUsageSession(mockSocket, eventData);

      expect(mockSumUpService.getIsEnabled).not.toHaveBeenCalled();
      expect((handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to start resource usage session'),
      );
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
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
    it('sends the final charge with configured precision and the action request ID', async () => {
      mockBillingService.getResourceUsageCharge.mockResolvedValue({ amount: -1234 });
      mockBillingService.getConfiguration.mockResolvedValue({ currency: 'KWD', minorUnit: 3 });
      await handler.handleStopResourceUsageSession(
        mockSocket as any,
        {
          payload: { resourceId: 10, requestId: 5 },
        } as AttractapEvent['data'],
      );
      expect(mockBillingService.getResourceUsageCharge).toHaveBeenCalledWith(99, 1);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payload: {
              success: true,
              requestId: 5,
              billingSummary: { amount: 1234, total: '1,234 KWD' },
            },
          }),
        }),
      );
    });

    it.each([null, { amount: 0 }])('omits the summary for an absent or zero charge (%p)', async (charge) => {
      mockBillingService.getResourceUsageCharge.mockResolvedValue(charge);
      await handler.handleStopResourceUsageSession(
        mockSocket as any,
        {
          payload: { resourceId: 10 },
        } as AttractapEvent['data'],
      );
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ payload: { success: true } }),
        }),
      );
      expect(mockBillingService.getConfiguration).not.toHaveBeenCalled();
    });

    it('does not expose another user’s charge when an administrator ends their session', async () => {
      mockResourceUsageService.endSession.mockResolvedValue({ id: 99, userId: 2 });
      await handler.handleStopResourceUsageSession(
        mockSocket as any,
        {
          payload: { resourceId: 10 },
        } as AttractapEvent['data'],
      );
      expect(mockBillingService.getResourceUsageCharge).not.toHaveBeenCalled();
    });

    it('keeps the action successful if the receipt lookup fails after ending the session', async () => {
      mockBillingService.getResourceUsageCharge.mockRejectedValue(new Error('billing unavailable'));
      await handler.handleStopResourceUsageSession(
        mockSocket as any,
        {
          payload: { resourceId: 10 },
        } as AttractapEvent['data'],
      );
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ payload: { success: true } }),
        }),
      );
    });
    const eventData = { payload: { resourceId: 10 } } as AttractapEvent['data'];

    it('returns early and does not end a session when the guard rejects the action', async () => {
      mockResourceActionGuard.validateResourceAction.mockResolvedValueOnce(false);

      await (handler as any).handleStopResourceUsageSession(mockSocket, eventData);

      expect(mockResourceActionGuard.validateResourceAction).toHaveBeenCalledWith(
        mockSocket,
        10,
        AttractapEventType.STOP_RESOURCE_USAGE_SESSION,
        undefined,
      );
      expect(mockFormsHandler.ensureFormsSatisfied).not.toHaveBeenCalled();
      expect(mockResourceUsageService.endSession).not.toHaveBeenCalled();
      expect(mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('returns early when forms are not satisfied (ensureFormsSatisfied returns null)', async () => {
      mockFormsHandler.ensureFormsSatisfied.mockResolvedValueOnce(null);

      await (handler as any).handleStopResourceUsageSession(mockSocket, eventData);

      expect(mockFormsHandler.ensureFormsSatisfied).toHaveBeenCalledWith({
        socket: mockSocket,
        resourceId: 10,
        action: ResourceFormAction.END,
      });
      expect(mockUsersService.findOne).not.toHaveBeenCalled();
      expect(mockResourceUsageService.endSession).not.toHaveBeenCalled();
      expect(mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('sends USER_NOT_FOUND when the authenticated user does not exist', async () => {
      mockUsersService.findOne.mockResolvedValueOnce(null);

      await (handler as any).handleStopResourceUsageSession(mockSocket, eventData);

      expect(mockResourceUsageService.endSession).not.toHaveBeenCalled();
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
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
      mockFormsHandler.ensureFormsSatisfied.mockResolvedValueOnce(formSubmissions);

      await (handler as any).handleStopResourceUsageSession(mockSocket, eventData);

      expect(mockResourceUsageService.endSession).toHaveBeenCalledWith(
        10,
        mockUser,
        { formSubmissions },
        {
          auditOrigin: { actorId: 1, authenticationMethod: null },
        },
      );
      expect(mockFormsHandler.clearFormDraft).toHaveBeenCalledWith(mockSocket, 10, ResourceFormAction.END);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.STOP_RESOURCE_USAGE_SESSION,
            payload: { success: true },
          }),
        }),
      );
    });

    it('sends the error message and logs when ending the session fails', async () => {
      mockResourceUsageService.endSession.mockRejectedValueOnce(new Error('stop failed'));

      await (handler as any).handleStopResourceUsageSession(mockSocket, eventData);

      expect((handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to stop resource usage session'),
      );
      expect(mockFormsHandler.clearFormDraft).not.toHaveBeenCalled();
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
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

    it('returns early and does not press the button when the guard rejects the action', async () => {
      mockResourceActionGuard.validateResourceAction.mockResolvedValueOnce(false);

      await (handler as any).handleTriggerFlowButton(mockSocket, eventData);

      expect(mockResourceActionGuard.validateResourceAction).toHaveBeenCalledWith(
        mockSocket,
        10,
        AttractapEventType.TRIGGER_FLOW_BUTTON,
        undefined,
      );
      expect(mockResourceFlowsExecutorService.pressButton).not.toHaveBeenCalled();
      expect(mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('presses the button and sends success', async () => {
      await (handler as any).handleTriggerFlowButton(mockSocket, eventData);

      expect(mockResourceFlowsExecutorService.pressButton).toHaveBeenCalledWith(10, 'btn-1', 1);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.TRIGGER_FLOW_BUTTON,
            payload: { success: true },
          }),
        }),
      );
    });

    it('sends the error message and logs when pressing the button fails', async () => {
      mockResourceFlowsExecutorService.pressButton.mockRejectedValueOnce(new Error('flow boom'));

      await (handler as any).handleTriggerFlowButton(mockSocket, eventData);

      expect((handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to trigger flow button'),
      );
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
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
    const request = { payload: { resourceId: 10, requestId: 7 } } as any;
    const startTime = new Date('2026-10-03T10:00:00Z');
    beforeEach(() => {
      mockResourceUsageService.getActiveSession.mockResolvedValue({ id: 99, userId: 1, startTime });
      metering.getLive.mockResolvedValue({
        meters: [
          {
            id: 1,
            name: 'Renamed Heartbeats',
            creditsPerUnit: 100,
            session: { usageId: 99, meterName: 'Heartbeats', creditsPerUnit: 2, latestValue: '0.125' },
          },
        ],
      });
      operating.getForResource.mockResolvedValue({
        operatingDataAvailable: true,
        isOperating: true,
        attributions: [
          { usageId: 99, durationMs: 120000 },
          { usageId: 98, durationMs: 80000 },
        ],
      });
    });
    it('returns captured meter names and rates after edits, with operating time attributed to the current usage', async () => {
      await handler.handleResourceUsageStats(mockSocket as any, request);
      expect(operating.getForResource).toHaveBeenCalledWith(10, expect.any(Date), startTime);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
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
      mockBillingService.getConfiguration.mockResolvedValue({ currency: 'KWD', minorUnit: 3 });
      await handler.handleResourceUsageStats(mockSocket as any, request);
      expect(mockSocket.sendMessage.mock.calls[0][0].data.payload.usage.meters[0]).toMatchObject({
        name: 'Heartbeats',
        creditsPerUnit: 2,
        formattedRate: '0,002 KWD',
      });
    });
    it('keeps unavailable readings distinct from zero and discards a different meter session', async () => {
      metering.getLive.mockResolvedValue({
        meters: [{ id: 1, name: 'Heartbeats', session: { usageId: 100, latestValue: '9' } }],
      });
      operating.getForResource.mockResolvedValue({ operatingDataAvailable: false, attributions: [] });
      await handler.handleResourceUsageStats(mockSocket as any, request);
      expect(mockSocket.sendMessage.mock.calls[0][0].data.payload.usage).toEqual({
        id: 99,
        meters: [],
        operatingDurationMs: null,
        isOperating: null,
      });
    });
    it('returns multiple named meters, preserving zero and unavailable values', async () => {
      metering.getLive.mockResolvedValue({
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
      await handler.handleResourceUsageStats(mockSocket as any, request);
      expect(mockSocket.sendMessage.mock.calls[0][0].data.payload.usage.meters).toEqual([
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
    it.each([null, { id: 99, userId: 2, startTime }])(
      'does not expose readings without an owned session (%p)',
      async (usage) => {
        mockResourceUsageService.getActiveSession.mockResolvedValue(usage);
        await handler.handleResourceUsageStats(mockSocket as any, request);
        expect(mockSocket.sendMessage.mock.calls[0][0].data.payload.usage).toBeNull();
        expect(metering.getLive).not.toHaveBeenCalled();
      },
    );
    it('does not query when the reader/card guard rejects the request', async () => {
      mockResourceActionGuard.validateResourceAction.mockResolvedValue(false);
      await handler.handleResourceUsageStats(mockSocket as any, request);
      expect(mockResourceUsageService.getActiveSession).not.toHaveBeenCalled();
    });
    describe('reader access with the actual resource guard', () => {
      let reader: { id: number; resources: { id: number }[] };
      beforeEach(() => {
        reader = { id: 42, resources: [{ id: 10 }] };
        (handler as any).resourceActionGuard = Object.assign(new ResourceActionGuard(), {
          attractapService: { findReaderById: jest.fn(async () => reader) },
          usersService: mockUsersService,
        });
      });
      it.each(['USER_NOT_AUTHENTICATED', 'RESOURCE_NOT_ASSOCIATED_WITH_READER'])(
        'rejects %s without looking up or disclosing readings',
        async (error) => {
          if (error === 'USER_NOT_AUTHENTICATED') (mockSocket.state as any).lastAuthenticatedUserId = null;
          else reader.resources = [];
          await handler.handleResourceUsageStats(mockSocket as any, request);
          expect(mockSocket.sendMessage).toHaveBeenCalledWith(
            new AttractapEvent(AttractapEventType.RESOURCE_USAGE_STATS, { requestId: 7, error }),
          );
          expect(mockResourceUsageService.getActiveSession).not.toHaveBeenCalled();
          expect(metering.getLive).not.toHaveBeenCalled();
          expect(operating.getForResource).not.toHaveBeenCalled();
        },
      );
      it('allows an authenticated session owner on a mapped resource', async () => {
        await handler.handleResourceUsageStats(mockSocket as any, request);
        expect(metering.getLive).toHaveBeenCalledWith(10);
        expect(mockSocket.sendMessage.mock.calls[0][0].data.payload.usage).toMatchObject({
          id: 99,
          meters: [{ id: 1, name: 'Heartbeats', creditsPerUnit: 2, formattedRate: '0,02 EUR', value: '0.125' }],
          operatingDurationMs: 120000,
        });
      });
    });
    it('discards results when the card changes during the lookup', async () => {
      metering.getLive.mockImplementation(async () => {
        mockSocket.state.lastAuthenticatedUserId = 2;
        return { meters: [] };
      });
      await handler.handleResourceUsageStats(mockSocket as any, request);
      expect(mockSocket.sendMessage).not.toHaveBeenCalled();
    });
    it('clears readings when the data service fails without failing the reader session', async () => {
      metering.getLive.mockRejectedValue(new Error('database unavailable'));
      await handler.handleResourceUsageStats(mockSocket as any, request);
      expect(mockSocket.sendMessage.mock.calls[0][0].data.payload.usage).toBeNull();
    });
  });
});
