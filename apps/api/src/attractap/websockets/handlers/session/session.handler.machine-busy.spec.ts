/* eslint-disable @typescript-eslint/no-explicit-any */
import { MachineBusyError } from '../../../../resources/usage/errors/machine-busy.error';
import { SessionChangeInterruptedError } from '../../../../resources/usage/errors/session-change-interrupted.error';
import { AttractapEventType } from '../../websocket.types';
import { AttractapSessionHandler } from './session.handler';

const user = { id: 1, username: 'u' };

/** The session handler around a start or stop that may wait for a shared machine. */
function setup() {
  const handler: any = Object.create(AttractapSessionHandler.prototype);
  const usage = { startSession: jest.fn(), endSession: jest.fn() };
  const release = jest.fn();
  const cardSessions = { hold: jest.fn().mockReturnValue(release), resume: jest.fn().mockReturnValue(false) };
  const resourceListService = { sendResourceListToSocket: jest.fn().mockResolvedValue(undefined) };
  Object.assign(handler, {
    logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    usersService: { findOne: jest.fn().mockResolvedValue(user) },
    resourceUsageService: usage,
    resourceActionGuard: { validateResourceAction: jest.fn().mockResolvedValue(true) },
    resourceListService,
    formsHandler: { ensureFormsSatisfied: jest.fn().mockResolvedValue([]), clearFormDraft: jest.fn() },
    supervisionService: { settleByCard: jest.fn() },
    billingService: { getResourceUsageCharge: jest.fn().mockResolvedValue(null), getConfiguration: jest.fn() },
    sumUpService: { getIsEnabled: jest.fn().mockResolvedValue(false) },
    startGate: { run: jest.fn().mockResolvedValue({ kind: 'proceed' }), afterStop: jest.fn() },
    cardSessions,
  });
  const socket: any = {
    id: 's',
    readerId: 5,
    state: { verifiedUserId: 1 },
    sendMessage: jest.fn().mockResolvedValue(undefined),
  };
  const lastReply = () => socket.sendMessage.mock.calls.at(-1)[0].data.payload;
  return {
    handler: handler as AttractapSessionHandler,
    usage,
    cardSessions,
    release,
    resourceListService,
    socket,
    lastReply,
  };
}

const event = (type: AttractapEventType) => ({ type, payload: { resourceId: 10, requestId: 4 } }) as any;

describe('AttractapSessionHandler while a start or stop waits for a shared machine', () => {
  describe.each([
    ['start', 'startSession', 'handleStartResourceUsageSession', AttractapEventType.START_RESOURCE_USAGE_SESSION],
    ['stop', 'endSession', 'handleStopResourceUsageSession', AttractapEventType.STOP_RESOURCE_USAGE_SESSION],
  ] as const)('a %s', (_name, serviceMethod, handlerMethod, type) => {
    it.each([
      ['succeeds', () => Promise.resolve({ id: 99, userId: 1 })],
      ['waits too long', () => Promise.reject(new MachineBusyError())],
    ])('holds the card session while in flight and lets it go once when it %s', async (_outcome, outcome) => {
      const { handler, usage, cardSessions, release, socket } = setup();
      let heldMeanwhile = false;
      usage[serviceMethod].mockImplementationOnce(() => {
        heldMeanwhile = cardSessions.hold.mock.calls.length === 1 && release.mock.calls.length === 0;
        return outcome();
      });
      await (handler as any)[handlerMethod](socket, event(type));
      expect(heldMeanwhile).toBe(true);
      expect(cardSessions.hold).toHaveBeenCalledWith(socket);
      expect(release).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['MachineBusyError', () => new MachineBusyError()],
      ['SessionChangeInterruptedError', () => new SessionChangeInterruptedError()],
    ])('reports a retryable %s and refreshes the row', async (name, createError) => {
      const { handler, usage, resourceListService, socket, lastReply } = setup();
      usage[serviceMethod].mockRejectedValueOnce(createError());
      await (handler as any)[handlerMethod](socket, event(type));
      expect(lastReply()).toMatchObject({ error: name, requestId: 4 });
      expect(resourceListService.sendResourceListToSocket).toHaveBeenCalledWith(socket, {
        resourceIds: new Set([10]),
      });
    });
  });
});
