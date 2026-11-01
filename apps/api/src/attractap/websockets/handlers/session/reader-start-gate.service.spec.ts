/* eslint-disable @typescript-eslint/no-explicit-any */
import { confirmation, lastSent, makeSocket, makeStepServices, sentTypes } from '../ui/ui-test-helpers.test-fixture';
import { ReaderStartGate } from './reader-start-gate.service';

const user = { id: 7 } as any;
const TOUCH = { schemaVersion: 1, steps: ['confirm', 'choose', 'info'] };
const LITE = { schemaVersion: 1, steps: ['card-confirm'] };

function setup(
  ui: unknown,
  outcome: any,
  opts: { override?: string | null; suspended?: boolean; hooks?: boolean } = {},
) {
  const services = makeStepServices();
  const preStart = {
    hasHooks: () => opts.hooks ?? true,
    evaluate: jest.fn().mockResolvedValue(outcome),
  };
  const sessionEnd = { ask: jest.fn() };
  const settings = { noScreenPolicyOverride: jest.fn().mockResolvedValue(opts.override ?? null) };
  const alerts = { isReaderSuspended: () => opts.suspended ?? false };
  const attractap = { findReaderById: jest.fn().mockResolvedValue({ firmware: { capabilities: { ui } } }) };
  const uiAudit = { record: jest.fn().mockResolvedValue(undefined) };
  const gate = new ReaderStartGate(
    preStart as never,
    sessionEnd as never,
    services.steps,
    services.cardSessions,
    settings as never,
    alerts as never,
    attractap as never,
    uiAudit as never,
  );
  const socket = makeSocket();
  services.cardSessions.issue(socket, 7, 'en');
  return { gate, services, preStart, sessionEnd, socket, uiAudit, attractap };
}

const input = (extra: Record<string, unknown> = {}) => ({ user, resourceId: 12, requestId: 77, ...extra });
const confirmOutcome = (extra: Record<string, unknown> = {}) => ({
  decision: 'confirm',
  plugin: 'reservations',
  confirmation: confirmation(extra),
});

describe('ReaderStartGate', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('lets a start through when no hook is registered', async () => {
    const { gate, socket, preStart } = setup(TOUCH, { decision: 'allow' }, { hooks: false });
    await expect(gate.run(socket, input())).resolves.toEqual({ kind: 'proceed' });
    expect(preStart.evaluate).not.toHaveBeenCalled();
  });

  it('allows', async () => {
    const { gate, socket } = setup(TOUCH, { decision: 'allow' });
    await expect(gate.run(socket, input())).resolves.toEqual({ kind: 'proceed' });
  });

  it('blocks with the literal plugin reason', async () => {
    const reason = { code: 'RESERVED', title: 'Reserved', body: 'Anna booked this' };
    const { gate, socket } = setup(TOUCH, { decision: 'block', plugin: 'p', reason });
    await expect(gate.run(socket, input())).resolves.toEqual({
      kind: 'reply',
      payload: { error: 'START_BLOCKED', reason },
    });
  });

  it('holds the START and sends a step on a screen reader (no START reply while a step is open)', async () => {
    const { gate, socket } = setup(TOUCH, confirmOutcome());
    await expect(gate.run(socket, input())).resolves.toEqual({ kind: 'held' });
    expect(sentTypes(socket)).toEqual(['UI_STEP_REQUEST']);
    expect(lastSent(socket, 'UI_STEP_REQUEST').requestId).toBe(77);
  });

  it('starts after the retry carries the stepId, passing only the plugin its own key, with no second step', async () => {
    const { gate, socket, preStart } = setup(TOUCH, confirmOutcome());
    await gate.run(socket, input());
    const stepId = lastSent(socket, 'UI_STEP_REQUEST').stepId;
    preStart.evaluate.mockResolvedValue({ decision: 'allow' });
    await expect(gate.run(socket, input({ requestId: 78, stepId }))).resolves.toEqual({ kind: 'proceed' });
    expect(preStart.evaluate).toHaveBeenLastCalledWith(
      expect.objectContaining({ satisfied: { reservations: ['res-conflict'] }, origin: 'reader' }),
    );
  });

  it('answers a stale or replayed stepId with a localized START_BLOCKED reason STEP_UNKNOWN', async () => {
    const { gate, socket } = setup(TOUCH, confirmOutcome());
    await gate.run(socket, input());
    const stepId = lastSent(socket, 'UI_STEP_REQUEST').stepId;
    await gate.run(socket, input({ stepId }));
    await expect(gate.run(socket, input({ stepId }))).resolves.toEqual({
      kind: 'reply',
      payload: {
        error: 'START_BLOCKED',
        reason: { code: 'STEP_UNKNOWN', title: 'Confirmation no longer valid', body: expect.any(String) },
      },
    });
  });

  it('answers an expired step with START_BLOCKED reason STEP_EXPIRED in the card language', async () => {
    const { gate, socket, services } = setup(TOUCH, confirmOutcome());
    services.cardSessions.issue(socket, 7, 'de');
    await gate.run(socket, input());
    const stepId = lastSent(socket, 'UI_STEP_REQUEST').stepId;
    jest.setSystemTime(Date.now() + 66_000);
    await expect(gate.run(socket, input({ stepId }))).resolves.toEqual({
      kind: 'reply',
      payload: {
        error: 'START_BLOCKED',
        reason: { code: 'STEP_EXPIRED', title: 'Bestätigung abgelaufen', body: expect.any(String) },
      },
    });
  });

  it('passes the card session language and id to the hooks', async () => {
    const { gate, socket, services, preStart } = setup(TOUCH, { decision: 'allow' });
    const card = services.cardSessions.issue(socket, 7, 'de');
    await gate.run(socket, input());
    expect(preStart.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'de', cardSessionId: card.id, origin: 'reader' }),
    );
  });

  describe('a screen reader that cannot show the confirmation', () => {
    it.each(['allow-with-warning', 'card-confirm', 'block'])(
      'never falls through to the no-screen policy (%s) and blocks with CONFIRMATION_UNAVAILABLE',
      async (override) => {
        const { gate, socket, services, uiAudit } = setup(TOUCH, confirmOutcome(), { override });
        services.cardSessions.end(socket, null, 'reader'); // no card session: issueStart fails
        const result = await gate.run(socket, input());
        expect(result).toEqual({
          kind: 'reply',
          payload: { error: 'START_BLOCKED', reason: expect.objectContaining({ code: 'CONFIRMATION_UNAVAILABLE' }) },
        });
        expect(uiAudit.record).toHaveBeenCalledWith(
          'ui.hook_decision',
          expect.objectContaining({ decision: 'block', reasonCode: 'CONFIRMATION_UNAVAILABLE', origin: 'reader' }),
        );
        expect(uiAudit.record).not.toHaveBeenCalledWith('ui.no_screen_policy_applied', expect.anything());
      },
    );
  });

  describe('capabilities', () => {
    it('uses the capabilities validated on READER_FIRMWARE_INFO without a database lookup', async () => {
      const { gate, socket, attractap } = setup(LITE, confirmOutcome());
      socket.state.uiSlots = { capabilities: TOUCH };
      await expect(gate.run(socket, input())).resolves.toEqual({ kind: 'held' });
      expect(attractap.findReaderById).not.toHaveBeenCalled();
    });

    it('treats a reader that reported no ui as schemaVersion 0', async () => {
      const { gate, socket, attractap } = setup(TOUCH, confirmOutcome());
      socket.state.uiSlots = { capabilities: null };
      await expect(gate.run(socket, input())).resolves.toMatchObject({
        kind: 'reply',
        payload: { error: 'START_BLOCKED', reason: { code: 'CONFIRMATION_REQUIRED' } },
      });
      expect(attractap.findReaderById).not.toHaveBeenCalled();
    });
  });

  describe('readers without a screen', () => {
    it('blocks by default (old firmware without ui and Lite alike)', async () => {
      for (const ui of [null, undefined, LITE]) {
        const { gate, socket } = setup(ui, confirmOutcome());
        const result = await gate.run(socket, input());
        expect(result).toMatchObject({ kind: 'reply', payload: { error: 'START_BLOCKED' } });
        expect(sentTypes(socket)).toEqual([]);
      }
    });

    it('honours the admin override over the plugin default and audits the policy', async () => {
      const { gate, socket, uiAudit } = setup(LITE, confirmOutcome({ noScreenPolicy: 'block' }), {
        override: 'allow-with-warning',
      });
      await expect(gate.run(socket, input())).resolves.toEqual({ kind: 'proceed', warning: true });
      expect(uiAudit.record).toHaveBeenCalledWith(
        'ui.no_screen_policy_applied',
        expect.objectContaining({ policy: 'allow-with-warning', plugin: 'reservations', userId: 7, readerId: 5 }),
      );
    });

    it('uses the plugin default when there is no override', async () => {
      const { gate, socket } = setup(LITE, confirmOutcome({ noScreenPolicy: 'allow-with-warning' }));
      await expect(gate.run(socket, input())).resolves.toEqual({ kind: 'proceed', warning: true });
    });

    it('card-confirm holds the START and the second tap of the same user starts it', async () => {
      const { gate, socket, services, preStart } = setup(LITE, confirmOutcome({ noScreenPolicy: 'card-confirm' }));
      await expect(gate.run(socket, input())).resolves.toEqual({ kind: 'held' });
      const sent = lastSent(socket, 'UI_STEP_REQUEST');
      expect(sent.kind).toBe('card-confirm');
      jest.advanceTimersByTime(50);
      services.cardSessions.issue(socket, 7, 'en');
      preStart.evaluate.mockResolvedValue({ decision: 'allow' });
      await expect(gate.run(socket, input({ requestId: 78, stepId: sent.stepId }))).resolves.toEqual({
        kind: 'proceed',
      });
    });

    it('card-confirm needs reader support, else it blocks', async () => {
      const { gate, socket } = setup(null, confirmOutcome({ noScreenPolicy: 'card-confirm' }));
      await expect(gate.run(socket, input())).resolves.toMatchObject({ kind: 'reply' });
    });

    it('treats a crash-loop suspended reader like a reader without a screen', async () => {
      const { gate, socket } = setup(TOUCH, confirmOutcome(), { suspended: true });
      await expect(gate.run(socket, input())).resolves.toMatchObject({
        kind: 'reply',
        payload: { error: 'START_BLOCKED' },
      });
    });
  });

  describe('after a stop', () => {
    const info = { resourceId: 12, userId: 7, sessionId: 1 };
    const makeAsked = () => {
      const onAnswer = jest.fn().mockResolvedValue(undefined);
      return {
        onAnswer,
        asked: {
          plugin: 'p',
          result: {
            decision: 'choose',
            choice: {
              stepKey: 'k',
              title: 'Free the rest?',
              body: 'b',
              choices: [
                { id: 'keep', label: 'Keep' },
                { id: 'free', label: 'Free' },
              ],
              defaultOnTimeout: 'keep',
              onAnswer,
            },
          },
        },
      };
    };

    it('shows the question to the holder on a screen reader, asked in the card language', async () => {
      const { gate, socket, sessionEnd, services } = setup(TOUCH, { decision: 'allow' });
      services.cardSessions.issue(socket, 7, 'de');
      const { asked, onAnswer } = makeAsked();
      sessionEnd.ask.mockResolvedValue(asked);
      await gate.afterStop(socket, info);
      expect(sessionEnd.ask).toHaveBeenCalledWith(info, 'de');
      expect(lastSent(socket, 'UI_STEP_REQUEST')).toMatchObject({ kind: 'choose', requestId: 0 });
      expect(onAnswer).not.toHaveBeenCalled();
    });

    it('keeps the question open for its expiresInSec (clamped) and closes it on the reader when it expires', async () => {
      const { gate, socket, sessionEnd } = setup(TOUCH, { decision: 'allow' });
      const { asked, onAnswer } = makeAsked();
      (asked.result.choice as any).expiresInSec = 25;
      sessionEnd.ask.mockResolvedValue(asked);
      await gate.afterStop(socket, info);
      const sent = lastSent(socket, 'UI_STEP_REQUEST');
      expect(sent.expiresAtMs - sent.serverNowMs).toBe(25_000);
      jest.advanceTimersByTime(25_000 + 5_000 + 1);
      expect(lastSent(socket, 'UI_STEP_CANCEL')).toEqual({ stepId: sent.stepId });
      await jest.advanceTimersByTimeAsync(0);
      expect(onAnswer).toHaveBeenCalledWith('keep');
    });

    it('survives a plugin answer callback that throws', async () => {
      const { gate, socket, sessionEnd } = setup(LITE, { decision: 'allow' });
      const { asked } = makeAsked();
      (asked.result.choice as any).onAnswer = jest.fn().mockRejectedValue(new Error('boom'));
      sessionEnd.ask.mockResolvedValue(asked);
      await expect(gate.afterStop(socket, info)).resolves.toBeUndefined();
    });

    it('applies the default on a reader without choose support', async () => {
      const { gate, socket, sessionEnd } = setup(LITE, { decision: 'allow' });
      const { asked, onAnswer } = makeAsked();
      sessionEnd.ask.mockResolvedValue(asked);
      await gate.afterStop(socket, info);
      expect(sentTypes(socket)).toEqual([]);
      expect(onAnswer).toHaveBeenCalledWith('keep');
    });

    it('does not ask somebody else: a takeover user holds no matching card session', async () => {
      const { gate, socket, sessionEnd } = setup(TOUCH, { decision: 'allow' });
      const { asked, onAnswer } = makeAsked();
      sessionEnd.ask.mockResolvedValue(asked);
      await gate.afterStop(socket, { ...info, userId: 99 });
      expect(sentTypes(socket)).toEqual([]);
      expect(onAnswer).toHaveBeenCalledWith('keep');
    });
  });
});
