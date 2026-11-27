/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  SessionDurationEstimateExceedsMaximumException,
  SessionDurationEstimateRequiredException,
  SessionExtensionExceedsMaximumException,
} from '../../../../resources/usage/session-duration/session-duration.errors';
import { AttractapEventType } from '../../websocket.types';
import { CardSessionService } from '../ui/card-session.service';
import { AttractapSessionHandler } from './session.handler';

const user = { id: 1, username: 'u' };

/** The session handler with a spy gate: only what the pre-start contract needs is real. */
function setup() {
  const handler: any = Object.create(AttractapSessionHandler.prototype);
  const gate = {
    run: jest.fn().mockResolvedValue({ kind: 'proceed' }),
    afterStop: jest.fn().mockResolvedValue(undefined),
  };
  const usage = {
    startSession: jest.fn().mockResolvedValue({}),
    endSession: jest.fn().mockResolvedValue({ id: 99, userId: 1 }),
    extendSession: jest.fn().mockResolvedValue({ id: 99, userId: 1 }),
  };
  const cardSessions = new CardSessionService();
  Object.assign(handler, {
    logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    usersService: { findOne: jest.fn().mockResolvedValue(user) },
    resourceUsageService: usage,
    resourceActionGuard: { validateResourceAction: jest.fn().mockResolvedValue(true) },
    resourceListService: { sendResourceListToSocket: jest.fn().mockResolvedValue(undefined) },
    formsHandler: { ensureFormsSatisfied: jest.fn().mockResolvedValue([]), clearFormDraft: jest.fn() },
    supervisionService: { settleByCard: jest.fn() },
    billingService: { getResourceUsageCharge: jest.fn().mockResolvedValue(null), getConfiguration: jest.fn() },
    sumUpService: { getIsEnabled: jest.fn().mockResolvedValue(false) },
    endMaintenanceRequests: { fileAfterEnd: jest.fn().mockResolvedValue(undefined) },
    startGate: gate,
    cardSessions,
  });
  const socket: any = {
    id: 's',
    readerId: 5,
    state: { verifiedUserId: 1 },
    sendMessage: jest.fn().mockResolvedValue(undefined),
  };
  const replies = (type: AttractapEventType) =>
    socket.sendMessage.mock.calls.map(([event]: any[]) => event.data).filter((data: any) => data.type === type);
  return { handler: handler as AttractapSessionHandler, gate, usage, socket, replies, cardSessions };
}

const start = (payload: Record<string, unknown> = {}) =>
  ({
    type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
    payload: { resourceId: 10, requestId: 4, ...payload },
  }) as any;
const extend = (payload: Record<string, unknown> = {}) =>
  ({
    type: AttractapEventType.EXTEND_RESOURCE_USAGE_SESSION,
    payload: { resourceId: 10, requestId: 6, ...payload },
  }) as any;

describe('AttractapSessionHandler and session durations', () => {
  it('passes the estimate of a reader that can ask', async () => {
    const { handler, usage, socket } = setup();
    socket.state.sessionDuration = true;
    await handler.handleStartResourceUsageSession(socket, start({ estimatedDurationMinutes: 90 }));
    expect(usage.startSession).toHaveBeenCalledWith(
      10,
      user,
      expect.objectContaining({ estimatedDurationMinutes: 90 }),
      expect.objectContaining({ canAskDuration: true }),
    );
  });

  it.each([
    ['a missing estimate', new SessionDurationEstimateRequiredException(240), 'SESSION_DURATION_ESTIMATE_REQUIRED'],
    [
      'an estimate above the maximum',
      new SessionDurationEstimateExceedsMaximumException(300, 240),
      'SESSION_DURATION_ESTIMATE_EXCEEDS_MAXIMUM',
    ],
  ])('answers a start refused for %s with its code', async (_name, refusal, code) => {
    const { handler, usage, socket, replies } = setup();
    socket.state.sessionDuration = true;
    usage.startSession.mockRejectedValueOnce(refusal);
    await handler.handleStartResourceUsageSession(socket, start());
    expect(usage.startSession).toHaveBeenCalledWith(
      10,
      user,
      expect.anything(),
      expect.objectContaining({ canAskDuration: true }),
    );
    expect(replies(AttractapEventType.START_RESOURCE_USAGE_SESSION)).toEqual([
      expect.objectContaining({ payload: { error: code, requestId: 4 } }),
    ]);
  });

  it('answers a start that failed without a code with its message', async () => {
    const { handler, usage, socket, replies } = setup();
    usage.startSession.mockRejectedValueOnce(new Error('boom'));
    await handler.handleStartResourceUsageSession(socket, start());
    expect(replies(AttractapEventType.START_RESOURCE_USAGE_SESSION)).toEqual([
      expect.objectContaining({ payload: { error: 'boom', requestId: 4 } }),
    ]);
  });

  it('never lets a reader without the capability be refused for a missing estimate', async () => {
    const { handler, usage, socket } = setup();
    await handler.handleStartResourceUsageSession(socket, start());
    expect(usage.startSession).toHaveBeenCalledWith(
      10,
      user,
      expect.not.objectContaining({ estimatedDurationMinutes: expect.anything() }),
      expect.objectContaining({ canAskDuration: false }),
    );
  });

  it.each([0, -5, 43201, 1.5])('treats the out-of-range estimate %s of a reader as no estimate', async (value) => {
    const { handler, usage, socket } = setup();
    socket.state.sessionDuration = true;
    await handler.handleStartResourceUsageSession(socket, start({ estimatedDurationMinutes: value }));
    expect(usage.startSession).toHaveBeenCalledWith(
      10,
      user,
      expect.not.objectContaining({ estimatedDurationMinutes: expect.anything() }),
      expect.objectContaining({ canAskDuration: true }),
    );
  });

  it("extends the card holder's session and refreshes the list", async () => {
    const { handler, usage, socket, replies } = setup();
    await handler.handleExtendResourceUsageSession(socket, extend({ extendByMinutes: 60 }));
    expect(usage.extendSession).toHaveBeenCalledWith(
      10,
      user,
      { extendByMinutes: 60 },
      { id: 1, authenticationMethod: null },
    );
    expect(replies(AttractapEventType.EXTEND_RESOURCE_USAGE_SESSION)).toEqual([
      expect.objectContaining({ payload: { success: true, usageId: 99, requestId: 6 } }),
    ]);
    expect((handler as any).resourceListService.sendResourceListToSocket).toHaveBeenCalled();
  });

  it('answers a refused extension with its code', async () => {
    const { handler, usage, socket, replies } = setup();
    usage.extendSession.mockRejectedValueOnce(new SessionExtensionExceedsMaximumException(new Date()));
    await handler.handleExtendResourceUsageSession(socket, extend({ toMax: true }));
    expect(replies(AttractapEventType.EXTEND_RESOURCE_USAGE_SESSION)).toEqual([
      expect.objectContaining({ payload: { error: 'SESSION_EXTENSION_EXCEEDS_MAXIMUM', requestId: 6 } }),
    ]);
  });
});
