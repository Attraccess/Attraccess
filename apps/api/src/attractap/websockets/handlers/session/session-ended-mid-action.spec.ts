/* eslint-disable @typescript-eslint/no-explicit-any -- partial service mocks */
import { AttractapEvent, AttractapEventType } from '../../websocket.types';
import { AttractapSessionHandler } from './session.handler';

/**
 * Display-less readers send READER_SESSION_ENDED shortly after an action, and the gateway handles
 * messages concurrently. A handler that re-reads `socket.state.verifiedUserId` after an await would
 * then see null and fail (or act for nobody). Each action must run for the user it was sent for.
 */
describe('AttractapSessionHandler when the reader login ends mid-action', () => {
  const user = { id: 1, username: 'alice' };
  let handler: AttractapSessionHandler;
  let socket: any;
  let services: Record<string, any>;

  const endLoginDuringAwait = () => {
    socket.state.verifiedUserId = null;
  };

  beforeEach(() => {
    socket = {
      id: 'sock-1',
      readerId: 42,
      state: { verifiedUserId: user.id, supervisionFlow: null },
      sendMessage: jest.fn().mockResolvedValue(true),
    };
    services = {
      usersService: { findOne: jest.fn(async ({ id }: { id: number }) => (id === user.id ? user : null)) },
      resourceActionGuard: {
        validateResourceAction: jest.fn(async () => {
          endLoginDuringAwait();
          return true;
        }),
      },
      formsHandler: { ensureFormsSatisfied: jest.fn().mockResolvedValue([]), clearFormDraft: jest.fn() },
      resourceUsageService: {
        lockDoor: jest.fn().mockResolvedValue(undefined),
        unlockDoor: jest.fn().mockResolvedValue(undefined),
        unlatchDoor: jest.fn().mockResolvedValue(undefined),
        startSession: jest.fn().mockResolvedValue({}),
        endSession: jest.fn().mockResolvedValue({ id: 9, userId: user.id }),
      },
      resourceFlowsExecutorService: { pressButton: jest.fn().mockResolvedValue({}) },
      billingService: { getResourceUsageCharge: jest.fn().mockResolvedValue(null) },
      supervisionService: { settleByCard: jest.fn() },
      logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    };
    handler = Object.assign(Object.create(AttractapSessionHandler.prototype), services);
  });

  const event = (type: AttractapEventType, payload: Record<string, unknown> = {}) =>
    new AttractapEvent(type, { resourceId: 3, ...payload }).data;
  const lastReply = () => socket.sendMessage.mock.calls.at(-1)[0].data.payload;

  it.each([
    ['handleLockDoor', AttractapEventType.LOCK_DOOR, 'lockDoor'],
    ['handleUnlockDoor', AttractapEventType.UNLOCK_DOOR, 'unlockDoor'],
    ['handleUnlatchDoor', AttractapEventType.UNLATCH_DOOR, 'unlatchDoor'],
  ] as const)('%s acts for the user who sent it', async (method, type, serviceMethod) => {
    await handler[method](socket, event(type));

    expect(services.resourceUsageService[serviceMethod]).toHaveBeenCalledWith(3, user);
    expect(lastReply()).toEqual({ success: true });
  });

  it('handleTriggerFlowButton presses the button for the user who sent it', async () => {
    await handler.handleTriggerFlowButton(socket, event(AttractapEventType.TRIGGER_FLOW_BUTTON, { buttonId: 'b' }));

    expect(services.resourceFlowsExecutorService.pressButton).toHaveBeenCalledWith(3, 'b', user.id);
    expect(lastReply()).toEqual({ success: true });
  });

  it('handleStartResourceUsageSession starts the session for the user who sent it, even while forms load', async () => {
    services.resourceActionGuard.validateResourceAction.mockResolvedValue(true);
    services.formsHandler.ensureFormsSatisfied.mockImplementation(async () => {
      endLoginDuringAwait();
      return [];
    });

    await handler.handleStartResourceUsageSession(socket, event(AttractapEventType.START_RESOURCE_USAGE_SESSION));

    expect(services.resourceUsageService.startSession).toHaveBeenCalledWith(
      3,
      user,
      expect.anything(),
      expect.anything(),
    );
    expect(lastReply()).toEqual({ success: true });
  });

  it('handleStopResourceUsageSession ends the session for the user who sent it', async () => {
    await handler.handleStopResourceUsageSession(socket, event(AttractapEventType.STOP_RESOURCE_USAGE_SESSION));

    expect(services.resourceUsageService.endSession).toHaveBeenCalledWith(
      3,
      user,
      expect.anything(),
      expect.anything(),
    );
    expect(lastReply()).toEqual(expect.objectContaining({ success: true, endedOwnSession: true }));
  });

  it('never looks up a user when nobody was logged in when the action arrived', async () => {
    socket.state.verifiedUserId = null;

    await handler.handleLockDoor(socket, event(AttractapEventType.LOCK_DOOR));
    await handler.handleTriggerFlowButton(socket, event(AttractapEventType.TRIGGER_FLOW_BUTTON, { buttonId: 'b' }));

    expect(services.usersService.findOne).not.toHaveBeenCalled();
    expect(services.resourceUsageService.lockDoor).not.toHaveBeenCalled();
    expect(services.resourceFlowsExecutorService.pressButton).not.toHaveBeenCalled();
  });
});
