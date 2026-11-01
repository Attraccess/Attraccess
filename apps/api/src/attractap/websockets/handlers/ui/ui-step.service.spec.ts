import { ResourceFormAction } from '@attraccess/database-entities';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { confirmation, lastSent, makeSocket, makeStepServices, sentTypes } from './ui-test-helpers.test-fixture';

const BINDING = { resourceId: 12, action: 'start' as const, projectId: undefined, userId: 7 };

function issue(socket: any, services: ReturnType<typeof makeStepServices>, extra: Record<string, unknown> = {}) {
  services.cardSessions.issue(socket, 7, 'en');
  const step = services.steps.issueStart(socket, {
    ...BINDING,
    plugin: 'reservations',
    confirmation: confirmation() as never,
    requestId: 77,
    cardConfirm: false,
    satisfied: {},
    ...extra,
  });
  return step as NonNullable<typeof step>;
}

describe('UiStepService', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('sends UI_STEP_REQUEST with a 128-bit base64url stepId and the START requestId', () => {
    const services = makeStepServices();
    const socket = makeSocket();
    const step = issue(socket, services);
    const payload = lastSent(socket, 'UI_STEP_REQUEST');
    expect(step.stepId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(payload).toMatchObject({ requestId: 77, stepId: step.stepId, kind: 'confirm', resourceId: 12 });
    expect(payload.expiresAtMs - payload.serverNowMs).toBe(60_000);
    expect(payload.actions.map((a: any) => a.role)).toEqual(['cancel', 'confirm']);
  });

  it('clamps the step lifetime to 120 s', () => {
    const services = makeStepServices();
    const socket = makeSocket();
    issue(socket, services, { confirmation: confirmation({ expiresInSec: 9999 }) });
    const payload = lastSent(socket, 'UI_STEP_REQUEST');
    expect(payload.expiresAtMs - payload.serverNowMs).toBe(120_000);
  });

  it('accepts the START retry once and accumulates satisfied step keys', () => {
    const services = makeStepServices();
    const socket = makeSocket();
    const step = issue(socket, services, { satisfied: { other: ['k0'] } });
    const result = services.steps.consumeStart(socket, step.stepId, BINDING);
    expect(result).toEqual({ ok: true, satisfied: { other: ['k0'], reservations: ['res-conflict'] } });
    expect(services.audit.record).toHaveBeenCalledWith(
      'ui.step_answered',
      expect.objectContaining({ plugin: 'reservations' }),
    );
  });

  it('rejects a replayed or unknown stepId', () => {
    const services = makeStepServices();
    const socket = makeSocket();
    const step = issue(socket, services);
    services.steps.consumeStart(socket, step.stepId, BINDING);
    expect(services.steps.consumeStart(socket, step.stepId, BINDING)).toEqual({ ok: false, error: 'STEP_UNKNOWN' });
    expect(services.steps.consumeStart(socket, 'nope', BINDING)).toEqual({ ok: false, error: 'STEP_UNKNOWN' });
    expect(services.steps.consumeStart(socket, undefined, BINDING)).toEqual({ ok: false, error: 'STEP_UNKNOWN' });
  });

  it.each([
    ['resource', { resourceId: 13 }],
    ['action', { action: 'takeover' as const }],
    ['project', { projectId: 4 }],
    ['user', { userId: 8 }],
  ])('rejects an answer for another %s and uses the step up', (_name, change) => {
    const services = makeStepServices();
    const socket = makeSocket();
    const step = issue(socket, services);
    expect(services.steps.consumeStart(socket, step.stepId, { ...BINDING, ...change })).toEqual({
      ok: false,
      error: 'STEP_UNKNOWN',
    });
    expect(services.steps.consumeStart(socket, step.stepId, BINDING)).toMatchObject({ ok: false });
  });

  it('rejects an answer from another reader socket', () => {
    const services = makeStepServices();
    const socket = makeSocket();
    const step = issue(socket, services);
    socket.readerId = 6;
    expect(services.steps.consumeStart(socket, step.stepId, BINDING)).toMatchObject({ ok: false });
  });

  it('rejects an answer after a different card session started', () => {
    const services = makeStepServices();
    const socket = makeSocket();
    const step = issue(socket, services);
    services.cardSessions.issue(socket, 7, 'en');
    expect(services.steps.consumeStart(socket, step.stepId, BINDING)).toMatchObject({ ok: false });
    expect(sentTypes(socket)).toContain('UI_STEP_CANCEL');
  });

  it('rejects an answer after the card session ended', () => {
    const services = makeStepServices();
    const socket = makeSocket();
    const step = issue(socket, services);
    services.cardSessions.end(socket, socket.state.cardSession.id, 'reader');
    expect(services.steps.consumeStart(socket, step.stepId, BINDING)).toMatchObject({ ok: false });
  });

  it('expires the step after the lifetime plus grace and clears the form draft', () => {
    const services = makeStepServices();
    const socket = makeSocket();
    const step = issue(socket, services);
    jest.advanceTimersByTime(64_999);
    expect(socket.state.uiSteps.has(step.stepId)).toBe(true);
    jest.advanceTimersByTime(2);
    expect(socket.state.uiSteps.size).toBe(0);
    expect(services.forms.clearFormDraft).toHaveBeenCalledWith(socket, 12, ResourceFormAction.START);
    expect(services.audit.record).toHaveBeenCalledWith('ui.step_expired', expect.anything());
    expect(services.steps.consumeStart(socket, step.stepId, BINDING)).toEqual({ ok: false, error: 'STEP_UNKNOWN' });
  });

  it('answers STEP_EXPIRED when the deadline passed but the timer has not run yet', () => {
    const services = makeStepServices();
    const socket = makeSocket();
    const step = issue(socket, services);
    jest.setSystemTime(Date.now() + 66_000);
    expect(services.steps.consumeStart(socket, step.stepId, BINDING)).toEqual({ ok: false, error: 'STEP_EXPIRED' });
  });

  it('cancel result drops the step, clears the draft and never starts anything', () => {
    const services = makeStepServices();
    const socket = makeSocket();
    const step = issue(socket, services);
    services.steps.handleResult(socket, { stepId: step.stepId, action: 'confirm' });
    expect(socket.state.uiSteps.size).toBe(1); // a "confirm" result is not an answer
    services.steps.handleResult(socket, { stepId: step.stepId, action: 'cancel' });
    expect(socket.state.uiSteps.size).toBe(0);
    expect(services.forms.clearFormDraft).toHaveBeenCalled();
    expect(services.audit.record).toHaveBeenCalledWith('ui.step_cancelled', expect.anything());
  });

  it('discards pending steps on disconnect', () => {
    const services = makeStepServices();
    const socket = makeSocket();
    issue(socket, services);
    services.steps.discardAll(socket);
    expect(socket.state.uiSteps.size).toBe(0);
  });

  it('keeps one open step per reader: a newer one replaces the older', () => {
    const services = makeStepServices();
    const socket = makeSocket();
    const first = issue(socket, services);
    const second = issue(socket, services);
    expect([...socket.state.uiSteps.keys()]).toEqual([second.stepId]);
    expect(services.steps.consumeStart(socket, first.stepId, BINDING)).toMatchObject({ ok: false });
  });

  it('does not send an invalid step (spoofed core status text)', () => {
    const services = makeStepServices();
    const socket = makeSocket();
    services.cardSessions.issue(socket, 7, 'en');
    const step = services.steps.issueStart(socket, {
      ...BINDING,
      plugin: 'p',
      confirmation: confirmation({ title: 'Access granted' }) as never,
      requestId: 1,
      cardConfirm: false,
      satisfied: {},
    });
    expect(step).toBeNull();
    expect(socket.sendMessage).not.toHaveBeenCalled();
  });

  describe('card-confirm', () => {
    function issueCardConfirm(socket: any, services: ReturnType<typeof makeStepServices>) {
      return issue(socket, services, { cardConfirm: true });
    }

    it('is confirmed by a new card session of the same user', () => {
      const services = makeStepServices();
      const socket = makeSocket();
      const step = issueCardConfirm(socket, services);
      jest.advanceTimersByTime(10);
      services.cardSessions.issue(socket, 7, 'en');
      expect(socket.state.uiSteps.size).toBe(1);
      expect(services.steps.consumeStart(socket, step.stepId, BINDING)).toMatchObject({ ok: true });
    });

    it('is cancelled and audited when another user taps, and never confirmed by them', () => {
      const services = makeStepServices();
      const socket = makeSocket();
      const step = issueCardConfirm(socket, services);
      jest.advanceTimersByTime(10);
      services.cardSessions.issue(socket, 8, 'en');
      expect(socket.state.uiSteps.size).toBe(0);
      expect(services.audit.record).toHaveBeenCalledWith(
        'ui.card_confirm_cancelled',
        expect.objectContaining({ userId: 7 }),
      );
      expect(services.steps.consumeStart(socket, step.stepId, { ...BINDING, userId: 8 })).toMatchObject({ ok: false });
    });

    it('cannot be confirmed by the same card session that opened it', () => {
      const services = makeStepServices();
      const socket = makeSocket();
      const step = issueCardConfirm(socket, services);
      expect(services.steps.consumeStart(socket, step.stepId, BINDING)).toMatchObject({ ok: false });
    });
  });

  describe('post-stop question', () => {
    const choice = (onAnswer = jest.fn()) => ({
      stepKey: 'free-rest',
      title: 'Free the rest of your booking?',
      body: 'You finished early.',
      choices: [
        { id: 'keep', label: 'Keep' },
        { id: 'free', label: 'Free the rest' },
      ],
      defaultOnTimeout: 'keep',
      onAnswer,
    });

    it('is sent with requestId 0 only to the holder of the live card session', () => {
      const services = makeStepServices();
      const socket = makeSocket();
      expect(services.steps.offerPostStop(socket, { plugin: 'p', choice: choice(), userId: 7, resourceId: 12 })).toBe(
        false,
      );
      services.cardSessions.issue(socket, 7, 'en');
      expect(services.steps.offerPostStop(socket, { plugin: 'p', choice: choice(), userId: 9, resourceId: 12 })).toBe(
        false,
      );
      expect(services.steps.offerPostStop(socket, { plugin: 'p', choice: choice(), userId: 7, resourceId: 12 })).toBe(
        true,
      );
      expect(lastSent(socket, 'UI_STEP_REQUEST')).toMatchObject({ requestId: 0, kind: 'choose' });
    });

    it('applies the answer, rejects unknown choices and falls back to the default on timeout', async () => {
      const services = makeStepServices();
      const socket = makeSocket();
      services.cardSessions.issue(socket, 7, 'en');
      const answered = jest.fn();
      services.steps.offerPostStop(socket, { plugin: 'p', choice: choice(answered), userId: 7, resourceId: 12 });
      const stepId = lastSent(socket, 'UI_STEP_REQUEST').stepId;
      services.steps.handleResult(socket, { stepId, action: 'free' });
      await Promise.resolve();
      expect(answered).toHaveBeenCalledWith('free');

      const timedOut = jest.fn();
      services.steps.offerPostStop(socket, { plugin: 'p', choice: choice(timedOut), userId: 7, resourceId: 12 });
      jest.advanceTimersByTime(20_001);
      await Promise.resolve();
      await Promise.resolve();
      expect(timedOut).toHaveBeenCalledWith('keep');
    });

    it('closes with the default when the card session ends', async () => {
      const services = makeStepServices();
      const socket = makeSocket();
      services.cardSessions.issue(socket, 7, 'en');
      const answered = jest.fn();
      services.steps.offerPostStop(socket, { plugin: 'p', choice: choice(answered), userId: 7, resourceId: 12 });
      services.cardSessions.end(socket, socket.state.cardSession.id, 'reader');
      await Promise.resolve();
      await Promise.resolve();
      expect(answered).toHaveBeenCalledWith('keep');
      expect(socket.state.uiSteps.size).toBe(0);
    });

    it('is not answerable by a result for a different action than a choice id', async () => {
      const services = makeStepServices();
      const socket = makeSocket();
      services.cardSessions.issue(socket, 7, 'en');
      const answered = jest.fn();
      services.steps.offerPostStop(socket, { plugin: 'p', choice: choice(answered), userId: 7, resourceId: 12 });
      services.steps.handleResult(socket, { stepId: lastSent(socket, 'UI_STEP_REQUEST').stepId, action: 'drop-table' });
      await Promise.resolve();
      expect(answered).toHaveBeenCalledWith('keep');
    });
  });
});
