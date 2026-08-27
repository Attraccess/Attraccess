/* eslint-disable @typescript-eslint/no-explicit-any */
import { AttractapSessionHandler } from './session.handler';
import { AttractapEventType, AttractapEvent } from '../websocket.types';
import { ResourceInUseError } from '../../../resources/usage/errors/resource-in-use.error';
import { InsufficientBalanceError } from '../../../billing/errors/insufficient-balance.error';
import { ResourceFormAction } from '@attraccess/database-entities';

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
  let mockResourceUsageService: { startSession: jest.Mock; endSession: jest.Mock };
  let mockResourceFlowsExecutorService: { pressButton: jest.Mock };
  let mockSumUpService: { getIsEnabled: jest.Mock };
  let mockResourceActionGuard: { validateResourceAction: jest.Mock };
  let mockResourceListService: { sendResourceListToSocket: jest.Mock };
  let mockFormsHandler: { ensureFormsSatisfied: jest.Mock; clearFormDraft: jest.Mock };
  let mockSupervisionService: { settleByCard: jest.Mock };

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
      startSession: jest.fn().mockResolvedValue({}),
      endSession: jest.fn().mockResolvedValue({}),
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

    (handler as any).usersService = mockUsersService;
    (handler as any).resourceUsageService = mockResourceUsageService;
    (handler as any).resourceFlowsExecutorService = mockResourceFlowsExecutorService;
    (handler as any).sumUpService = mockSumUpService;
    (handler as any).resourceActionGuard = mockResourceActionGuard;
    (handler as any).resourceListService = mockResourceListService;
    (handler as any).formsHandler = mockFormsHandler;
    (handler as any).supervisionService = mockSupervisionService;
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
        {},
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
        { supervisorUserId: 2 },
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

    describe('ResourceInUseError handling', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('schedules a resource list refresh after 1000ms and sends no error message', async () => {
        mockResourceUsageService.startSession.mockRejectedValueOnce(new ResourceInUseError());

        await (handler as any).handleStartResourceUsageSession(mockSocket, eventData);

        // No error message is sent to the socket and the draft is not cleared.
        expect(mockSocket.sendMessage).not.toHaveBeenCalled();
        expect(mockFormsHandler.clearFormDraft).not.toHaveBeenCalled();
        expect(mockResourceListService.sendResourceListToSocket).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1000);
        // Flush the microtask queue so the async setTimeout callback runs.
        await Promise.resolve();

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
    const eventData = { payload: { resourceId: 10 } } as AttractapEvent['data'];

    it('returns early and does not end a session when the guard rejects the action', async () => {
      mockResourceActionGuard.validateResourceAction.mockResolvedValueOnce(false);

      await (handler as any).handleStopResourceUsageSession(mockSocket, eventData);

      expect(mockResourceActionGuard.validateResourceAction).toHaveBeenCalledWith(
        mockSocket,
        10,
        AttractapEventType.START_RESOURCE_USAGE_SESSION,
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
            type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
            payload: { error: 'USER_NOT_FOUND' },
          }),
        }),
      );
    });

    it('ends the session, clears the form draft and sends success', async () => {
      const formSubmissions = [{ id: 5 }];
      mockFormsHandler.ensureFormsSatisfied.mockResolvedValueOnce(formSubmissions);

      await (handler as any).handleStopResourceUsageSession(mockSocket, eventData);

      expect(mockResourceUsageService.endSession).toHaveBeenCalledWith(10, mockUser, { formSubmissions });
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
});
