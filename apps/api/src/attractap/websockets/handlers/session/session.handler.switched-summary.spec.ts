/* eslint-disable @typescript-eslint/no-explicit-any */
import { AttractapSessionHandler } from './session.handler';

// ATT-1421: ending a session whose project was switched ends its last part, but the card holder is told about the
// session: from its start, with what all parts cost.
describe('AttractapSessionHandler end summary of a switched session', () => {
  const lastPart = {
    id: 99,
    userId: 1,
    previousUsageId: 98,
    sessionStartTime: new Date('2026-11-28T10:00:00Z'),
    startTime: new Date('2026-11-28T10:05:22Z'),
    endTime: new Date('2026-11-28T10:06:24Z'),
  };

  const createHandlerSetup = (usage: object, billingService: object) => {
    const socket = { id: 'sock-1', readerId: 42, state: { verifiedUserId: 1 }, sendMessage: jest.fn() };
    const handler: AttractapSessionHandler = Object.assign(Object.create(AttractapSessionHandler.prototype), {
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      usersService: { findOne: jest.fn().mockResolvedValue({ id: 1 }) },
      resourceUsageService: { endSession: jest.fn().mockResolvedValue(usage) },
      resourceActionGuard: { validateResourceAction: jest.fn().mockResolvedValue(true) },
      resourceListService: { sendResourceListToSocket: jest.fn() },
      formsHandler: { ensureFormsSatisfied: jest.fn().mockResolvedValue([]), clearFormDraft: jest.fn() },
      cardSessions: { resume: jest.fn(), hold: jest.fn().mockReturnValue(() => undefined) },
      startGate: { afterStop: jest.fn() },
      billingService,
    });
    return { handler, socket };
  };

  const stopPayload = async (usage: object, billing: Record<string, jest.Mock>) => {
    const { handler, socket } = createHandlerSetup(usage, {
      getConfiguration: jest.fn().mockResolvedValue({ currency: 'EUR', minorUnit: 2 }),
      getResourceUsageCharge: jest.fn().mockResolvedValue(null),
      getSwitchedSessionCharge: jest.fn().mockResolvedValue(null),
      ...billing,
    });
    await handler.handleStopResourceUsageSession(socket as any, { payload: { resourceId: 10 } } as any);
    return socket.sendMessage.mock.calls.at(-1)[0].data.payload;
  };

  it('shows the whole duration and the charges of all parts when the last part billed nothing', async () => {
    const getSwitchedSessionCharge = jest
      .fn()
      .mockResolvedValue({ continues: false, sessionAmount: -2400, resourceName: 'Laser' });

    await expect(stopPayload(lastPart, { getSwitchedSessionCharge })).resolves.toEqual({
      success: true,
      endedOwnSession: true,
      durationSeconds: 384,
      billingSummary: { amount: 2400, total: '24,00 EUR' },
    });
    expect(getSwitchedSessionCharge).toHaveBeenCalledWith(99, 1);
  });

  it('shows no charge line when no part billed anything', async () => {
    const payload = await stopPayload(lastPart, {
      getSwitchedSessionCharge: jest.fn().mockResolvedValue({ continues: false, sessionAmount: 0 }),
    });

    expect(payload).toEqual({ success: true, endedOwnSession: true, durationSeconds: 384 });
  });

  it('reads a session that was never switched like before', async () => {
    const getResourceUsageCharge = jest.fn().mockResolvedValue({ amount: -200 });
    const getSwitchedSessionCharge = jest.fn();

    const payload = await stopPayload(
      { ...lastPart, previousUsageId: null, sessionStartTime: null },
      { getResourceUsageCharge, getSwitchedSessionCharge },
    );

    expect(payload).toMatchObject({ durationSeconds: 62, billingSummary: { amount: 200, total: '2,00 EUR' } });
    expect(getSwitchedSessionCharge).not.toHaveBeenCalled();
  });
});
