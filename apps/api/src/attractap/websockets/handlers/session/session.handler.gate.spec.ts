/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException } from '@nestjs/common';
import { ResourceInUseError } from '../../../../resources/usage/errors/resource-in-use.error';
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
    startGate: gate,
    cardSessions,
  });
  const socket: any = {
    id: 's',
    readerId: 5,
    state: { lastAuthenticatedUserId: 1 },
    sendMessage: jest.fn().mockResolvedValue(undefined),
  };
  const replies = (type: AttractapEventType) =>
    socket.sendMessage.mock.calls.map(([event]: any[]) => event.data).filter((data: any) => data.type === type);
  return { handler: handler as AttractapSessionHandler, gate, usage, socket, replies, cardSessions };
}

const start = (payload: Record<string, unknown> = {}) =>
  ({ type: AttractapEventType.START_RESOURCE_USAGE_SESSION, payload: { resourceId: 10, requestId: 4, ...payload } }) as any;
const stop = (payload: Record<string, unknown> = {}) =>
  ({ type: AttractapEventType.STOP_RESOURCE_USAGE_SESSION, payload: { resourceId: 10, requestId: 5, ...payload } }) as any;

describe('AttractapSessionHandler and the pre-start gate', () => {
  it('sends no reply and starts nothing while a step holds the START', async () => {
    const { handler, gate, usage, socket } = setup();
    gate.run.mockResolvedValue({ kind: 'held' });
    await handler.handleStartResourceUsageSession(socket, start());
    expect(socket.sendMessage).not.toHaveBeenCalled();
    expect(usage.startSession).not.toHaveBeenCalled();
  });

  it('answers a reply with the START_BLOCKED payload and the request id, and starts nothing', async () => {
    const { handler, gate, usage, socket, replies } = setup();
    const reason = { code: 'RESERVED', title: 'Reserved', body: 'Anna booked this' };
    gate.run.mockResolvedValue({ kind: 'reply', payload: { error: 'START_BLOCKED', reason } });
    await handler.handleStartResourceUsageSession(socket, start());
    expect(replies(AttractapEventType.START_RESOURCE_USAGE_SESSION)).toEqual([
      expect.objectContaining({ payload: { error: 'START_BLOCKED', reason, requestId: 4 } }),
    ]);
    expect(usage.startSession).not.toHaveBeenCalled();
  });

  it('passes warning: true through to the success reply', async () => {
    const { handler, gate, socket, replies } = setup();
    gate.run.mockResolvedValue({ kind: 'proceed', warning: true });
    await handler.handleStartResourceUsageSession(socket, start());
    expect(replies(AttractapEventType.START_RESOURCE_USAGE_SESSION)[0].payload).toEqual({
      success: true,
      warning: true,
      requestId: 4,
    });
  });

  it('passes stepId, requestId, project and takeover through to the gate', async () => {
    const { handler, gate, socket } = setup();
    await handler.handleStartResourceUsageSession(
      socket,
      start({ stepId: 'k3J9vQ2mXc8LrT0aW5yZbQ', projectId: 3, forceTakeOver: true }),
    );
    expect(gate.run).toHaveBeenCalledWith(socket, {
      user,
      resourceId: 10,
      projectId: 3,
      forceTakeOver: true,
      requestId: 4,
      stepId: 'k3J9vQ2mXc8LrT0aW5yZbQ',
      supervisorUserId: undefined,
    });
  });

  it('answers a precheck refusal from the gate like the same refusal from startSession', async () => {
    const { handler, gate, usage, socket, replies } = setup();
    gate.run.mockRejectedValueOnce(new ResourceInUseError());
    await handler.handleStartResourceUsageSession(socket, start());
    gate.run.mockRejectedValueOnce(new BadRequestException('You must complete the resource introduction'));
    await handler.handleStartResourceUsageSession(socket, start());
    const payloads = replies(AttractapEventType.START_RESOURCE_USAGE_SESSION).map((data: any) => data.payload);
    expect(payloads).toEqual([
      { error: new ResourceInUseError().message, requestId: 4 },
      { error: 'You must complete the resource introduction', requestId: 4 },
    ]);
    expect(usage.startSession).not.toHaveBeenCalled();
  });

  it('keeps the card session alive when START carries its id', async () => {
    jest.useFakeTimers();
    try {
      const { handler, socket, cardSessions } = setup();
      const card = cardSessions.issue(socket, 1, 'en');
      jest.advanceTimersByTime(36_000);
      expect(cardSessions.current(socket)).toBeNull();
      await handler.handleStartResourceUsageSession(socket, start({ cardSessionId: card.id }));
      expect(cardSessions.current(socket)?.id).toBe(card.id);
    } finally {
      jest.useRealTimers();
    }
  });

  describe('STOP', () => {
    it('never calls the gate and asks the post-stop question only for the acting user', async () => {
      const { handler, gate, socket } = setup();
      await handler.handleStopResourceUsageSession(socket, stop());
      expect(gate.run).not.toHaveBeenCalled();
      expect(gate.afterStop).toHaveBeenCalledWith(socket, { resourceId: 10, userId: 1, sessionId: 99 });
    });

    it('asks nothing when the ended session belonged to somebody else', async () => {
      const { handler, gate, usage, socket, replies } = setup();
      usage.endSession.mockResolvedValue({ id: 98, userId: 2 });
      await handler.handleStopResourceUsageSession(socket, stop());
      expect(gate.run).not.toHaveBeenCalled();
      expect(gate.afterStop).not.toHaveBeenCalled();
      expect(replies(AttractapEventType.STOP_RESOURCE_USAGE_SESSION)[0].payload).toMatchObject({
        success: true,
        endedOwnSession: false,
      });
    });

    it('asks nothing when the stop failed', async () => {
      const { handler, gate, usage, socket } = setup();
      usage.endSession.mockRejectedValue(new Error('No active session'));
      await handler.handleStopResourceUsageSession(socket, stop());
      expect(gate.run).not.toHaveBeenCalled();
      expect(gate.afterStop).not.toHaveBeenCalled();
    });
  });
});
