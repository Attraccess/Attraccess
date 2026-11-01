/* eslint-disable @typescript-eslint/no-explicit-any */
import { AttractapUiHandler } from './ui.handler';
import { CardSessionService } from './card-session.service';
import { makeSocket } from './ui-test-helpers.test-fixture';

function setup() {
  const handler = new AttractapUiHandler() as any;
  const slots = { onFirmwareInfo: jest.fn().mockResolvedValue(undefined), cleanup: jest.fn(), renderReport: jest.fn() };
  const steps = { discardAll: jest.fn(), handleResult: jest.fn() };
  const alerts = { touchCrash: jest.fn(), raise: jest.fn().mockResolvedValue({}) };
  const cardSessions = new CardSessionService();
  Object.assign(handler, { slots, steps, alerts, cardSessions });
  return { handler: handler as AttractapUiHandler, slots, steps, alerts, cardSessions };
}

describe('AttractapUiHandler crash-loop protection', () => {
  it.each(['PANIC', 'INT_WDT', 'TASK_WDT', 'WDT', 'CPU_LOCKUP'])(
    'suspends the reader after %s',
    async (resetReason) => {
      const { handler, alerts } = setup();
      await handler.onFirmwareInfo(makeSocket(), { resetReason, capabilities: {} });
      expect(alerts.raise).toHaveBeenCalledWith('crash-loop', expect.any(String), { readerId: 5 });
    },
  );

  it.each(['POWERON', 'SW', 'EXT', 'BROWNOUT', undefined])('does not suspend after %s', async (resetReason) => {
    const { handler, alerts } = setup();
    await handler.onFirmwareInfo(makeSocket(), { resetReason, capabilities: {} });
    expect(alerts.raise).not.toHaveBeenCalled();
  });

  it('does not treat a reconnect of a long-running reader as a new panic', async () => {
    const { handler, alerts } = setup();
    await handler.onFirmwareInfo(makeSocket(), { resetReason: 'PANIC', uptimeMs: 3_600_000 });
    expect(alerts.raise).not.toHaveBeenCalled();
  });

  it('still runs the slot sync (which shows nothing while suspended)', async () => {
    const { handler, slots } = setup();
    await handler.onFirmwareInfo(makeSocket(), { resetReason: 'PANIC', capabilities: { ui: { schemaVersion: 1 } } });
    expect(slots.onFirmwareInfo).toHaveBeenCalledWith(expect.anything(), { schemaVersion: 1 });
  });

  it('ends the matching card session on CARD_SESSION_ENDED and ignores malformed messages', () => {
    const { handler, cardSessions } = setup();
    const socket = makeSocket();
    const session = cardSessions.issue(socket, 7, 'en');
    handler.handleCardSessionEnded(socket, { type: 'CARD_SESSION_ENDED', payload: { cardSessionId: 5 } } as any);
    expect(cardSessions.current(socket)).not.toBeNull();
    handler.handleCardSessionEnded(socket, {
      type: 'CARD_SESSION_ENDED',
      payload: { cardSessionId: session.id },
    } as any);
    expect(cardSessions.current(socket)).toBeNull();
  });

  it('discards steps and the card session on close', () => {
    const { handler, steps, slots, cardSessions } = setup();
    const socket = makeSocket();
    cardSessions.issue(socket, 7, 'en');
    handler.cleanup(socket);
    expect(steps.discardAll).toHaveBeenCalled();
    expect(slots.cleanup).toHaveBeenCalled();
    expect(socket.state.cardSession).toBeNull();
  });

  it('keeps the card session alive when UI_STEP_RESULT carries its id, before recording the answer', () => {
    jest.useFakeTimers();
    try {
      const { handler, steps, cardSessions } = setup();
      const socket = makeSocket();
      const session = cardSessions.issue(socket, 7, 'en');
      jest.advanceTimersByTime(36_000);
      expect(cardSessions.current(socket)).toBeNull();
      handler.handleStepResult(socket, {
        type: 'UI_STEP_RESULT',
        payload: { stepId: 's', action: 'cancel', cardSessionId: session.id },
      } as any);
      expect(cardSessions.current(socket)?.id).toBe(session.id);
      expect(steps.handleResult).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
