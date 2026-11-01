/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException } from '@nestjs/common';
import { PreStartService } from './pre-start.service';
import { StartBlockedException, StartConfirmationRequiredException } from './start-confirmation.errors';
import { MAX_OPEN_WEB_STEPS, WebStartStepStore } from './web-start-step.store';
import { projectAttractapAuditEvent } from '../../../audit/policies/attractap';

const user = { id: 7 } as any;
const confirmOutcome = {
  decision: 'confirm',
  plugin: 'reservations',
  confirmation: { stepKey: 'k1', title: 'Reserved from 14:00', body: 'Start anyway?', expiresInSec: 30 },
};

function setup(outcome: any = { decision: 'allow' }, precheck: jest.Mock = jest.fn().mockResolvedValue(undefined)) {
  const hooks = { hasPreStartHooks: () => true, runPreStart: jest.fn().mockResolvedValue(outcome) };
  const usage = { precheckStart: precheck };
  const audit = { recordAttractap: jest.fn().mockResolvedValue(undefined) };
  const store = new WebStartStepStore(audit as never);
  const settings = { resolveLanguage: jest.fn(async (locale?: string) => (locale === 'de' ? 'de' : 'en')) };
  const service = new PreStartService(usage as never, hooks as never, store, settings as never);
  return { service, hooks, usage, store, audit, settings };
}

const web = { origin: 'web' as const };

async function catchError(promise: Promise<unknown>): Promise<any> {
  return promise.then(
    () => undefined,
    (e) => e,
  );
}

describe('PreStartService', () => {
  it('does nothing when no hook is registered', async () => {
    const { service, hooks, usage } = setup();
    (hooks as any).hasPreStartHooks = () => false;
    await service.gateHttp(3, user, {}, web);
    expect(usage.precheckStart).not.toHaveBeenCalled();
  });

  it('runs the can-start precheck before the hooks and throws its refusal, so no plugin step is shown', async () => {
    const refusal = new BadRequestException('no introduction');
    const { service, hooks } = setup(confirmOutcome, jest.fn().mockRejectedValue(refusal));
    await expect(service.gateHttp(3, user, {}, web)).rejects.toBe(refusal);
    expect(hooks.runPreStart).not.toHaveBeenCalled();
  });

  it('passes the given language, else the user preference', async () => {
    const { service, hooks } = setup({ decision: 'allow' });
    await service.evaluate({ resourceId: 3, user, origin: 'reader', language: 'de' });
    expect(hooks.runPreStart.mock.calls.at(-1)?.[0].language).toBe('de');
    await service.gateHttp(3, { id: 7, locale: 'de' } as any, {}, web);
    expect(hooks.runPreStart.mock.calls.at(-1)?.[0].language).toBe('de');
    await service.gateHttp(3, { id: 7, locale: 'fr' } as any, {}, web);
    expect(hooks.runPreStart.mock.calls.at(-1)?.[0].language).toBe('en');
  });

  it('allows', async () => {
    const { service } = setup({ decision: 'allow' });
    await expect(service.gateHttp(3, user, {}, web)).resolves.toBeUndefined();
  });

  it('answers a confirm with a typed 409 CONFIRMATION_REQUIRED and a stepId', async () => {
    const { service } = setup(confirmOutcome);
    const error = await catchError(service.gateHttp(3, user, {}, web));
    expect(error).toBeInstanceOf(StartConfirmationRequiredException);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({
      code: 'CONFIRMATION_REQUIRED',
      stepId: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/),
      confirmation: { title: 'Reserved from 14:00', body: 'Start anyway?' },
    });
  });

  it('answers a block with a typed 403 START_BLOCKED reason', async () => {
    const reason = { code: 'RESERVED', title: 'Reserved', body: 'Anna booked' };
    const { service } = setup({ decision: 'block', plugin: 'p', reason });
    const error = await catchError(service.gateHttp(3, user, {}, web));
    expect(error).toBeInstanceOf(StartBlockedException);
    expect(error.getStatus()).toBe(403);
    expect(error.getResponse()).toMatchObject({ code: 'START_BLOCKED', reason });
  });

  it('retries with confirmedStepIds and tells the plugin only its own confirmed keys', async () => {
    const { service, hooks } = setup(confirmOutcome);
    const stepId = (await catchError(service.gateHttp(3, user, {}, web))).getResponse().stepId;
    hooks.runPreStart.mockResolvedValue({ decision: 'allow' });
    await expect(service.gateHttp(3, user, { confirmedStepIds: [stepId] }, web)).resolves.toBeUndefined();
    const run = hooks.runPreStart.mock.calls.at(-1)?.[0];
    expect(run.satisfied.get('reservations')).toEqual(new Set(['k1']));
    expect(run.origin).toBe('web');
  });

  it('accumulates satisfied keys when a second plugin asks next', async () => {
    const { service, hooks } = setup(confirmOutcome);
    const first = (await catchError(service.gateHttp(3, user, {}, web))).getResponse().stepId;
    hooks.runPreStart.mockResolvedValue({
      decision: 'confirm',
      plugin: 'billing',
      confirmation: { stepKey: 'k2', title: 'Fee applies', body: 'ok?' },
    });
    const second = (await catchError(service.gateHttp(3, user, { confirmedStepIds: [first] }, web))).getResponse()
      .stepId;
    hooks.runPreStart.mockResolvedValue({ decision: 'allow' });
    await service.gateHttp(3, user, { confirmedStepIds: [second] }, web);
    const run = hooks.runPreStart.mock.calls.at(-1)?.[0];
    expect(run.satisfied.get('reservations')).toEqual(new Set(['k1']));
    expect(run.satisfied.get('billing')).toEqual(new Set(['k2']));
  });

  describe('step id binding', () => {
    async function issued() {
      const ctx = setup(confirmOutcome);
      const stepId = (
        await catchError(ctx.service.gateHttp(3, user, { projectId: 2 }, { origin: 'api', apiTokenId: 11 }))
      ).getResponse().stepId;
      ctx.hooks.runPreStart.mockResolvedValue({ decision: 'allow' });
      return { ...ctx, stepId };
    }

    it.each([
      [
        'user',
        () => ({ u: { id: 8 } as any, dto: { projectId: 2 }, p: { origin: 'api' as const, apiTokenId: 11 }, r: 3 }),
      ],
      ['token', () => ({ u: user, dto: { projectId: 2 }, p: { origin: 'api' as const, apiTokenId: 12 }, r: 3 })],
      ['resource', () => ({ u: user, dto: { projectId: 2 }, p: { origin: 'api' as const, apiTokenId: 11 }, r: 4 })],
      [
        'action',
        () => ({
          u: user,
          dto: { projectId: 2, forceTakeOver: true },
          p: { origin: 'api' as const, apiTokenId: 11 },
          r: 3,
        }),
      ],
      ['project', () => ({ u: user, dto: { projectId: 3 }, p: { origin: 'api' as const, apiTokenId: 11 }, r: 3 })],
      ['origin', () => ({ u: user, dto: { projectId: 2 }, p: { origin: 'web' as const }, r: 3 })],
    ])('rejects a step id used for another %s', async (_name, build) => {
      const { service, stepId } = await issued();
      const { u, dto, p, r } = build();
      const error = await catchError(service.gateHttp(r, u, { ...dto, confirmedStepIds: [stepId] } as any, p));
      expect(error.getResponse()).toMatchObject({ code: 'STEP_UNKNOWN' });
    });

    it('rejects a used step id and an expired one', async () => {
      jest.useFakeTimers();
      try {
        const { service, stepId } = await issued();
        const dto = { projectId: 2, confirmedStepIds: [stepId] };
        const principal = { origin: 'api' as const, apiTokenId: 11 };
        await service.gateHttp(3, user, dto, principal);
        const replay = await catchError(service.gateHttp(3, user, dto, principal));
        expect(replay.getResponse()).toMatchObject({ code: 'STEP_UNKNOWN' });

        const second = setup(confirmOutcome);
        const id = (await catchError(second.service.gateHttp(3, user, {}, web))).getResponse().stepId;
        jest.advanceTimersByTime(36_000);
        const late = await catchError(second.service.gateHttp(3, user, { confirmedStepIds: [id] }, web));
        expect(late.getResponse()).toMatchObject({ code: 'STEP_EXPIRED' });
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('supervision approval', () => {
    it('blocks with the plugin text when a confirmation would be needed', async () => {
      const { service, hooks } = setup(confirmOutcome);
      const error = await catchError(service.gateSupervision(3, user, {}, 99));
      expect(error).toBeInstanceOf(StartBlockedException);
      expect(error.getResponse()).toMatchObject({ reason: { title: 'Reserved from 14:00' } });
      expect(hooks.runPreStart.mock.calls[0][0].origin).toBe('supervision');
    });

    it('passes the supervisor to the precheck and lets allow through', async () => {
      const { service, usage } = setup({ decision: 'allow' });
      await service.gateSupervision(3, user, {}, 99);
      expect(usage.precheckStart).toHaveBeenCalledWith(3, user, expect.anything(), 99);
    });
  });

  describe('web step store', () => {
    it('keeps one open confirmation per binding: a newer 409 replaces the older id', async () => {
      const { service, hooks, store } = setup(confirmOutcome);
      const first = (await catchError(service.gateHttp(3, user, {}, web))).getResponse().stepId;
      const second = (await catchError(service.gateHttp(3, user, {}, web))).getResponse().stepId;
      expect(store.size).toBe(1);
      hooks.runPreStart.mockResolvedValue({ decision: 'allow' });
      const stale = await catchError(service.gateHttp(3, user, { confirmedStepIds: [first] }, web));
      expect(stale.getResponse()).toMatchObject({ code: 'STEP_UNKNOWN' });
      const fresh = setup(confirmOutcome);
      const id = (await catchError(fresh.service.gateHttp(3, user, {}, web))).getResponse().stepId;
      fresh.hooks.runPreStart.mockResolvedValue({ decision: 'allow' });
      await expect(fresh.service.gateHttp(3, user, { confirmedStepIds: [id] }, web)).resolves.toBeUndefined();
      expect(second).not.toBe(first);
    });

    it('caps the number of open confirmations', () => {
      const { store } = setup();
      for (let userId = 1; userId <= MAX_OPEN_WEB_STEPS + 5; userId += 1) {
        store.issue({ userId, resourceId: 3, action: 'start', origin: 'web' }, 'p', 'k', 60, {});
      }
      expect(store.size).toBe(MAX_OPEN_WEB_STEPS);
    });

    it('audits issued, answered and expired web/API steps with their origin', async () => {
      jest.useFakeTimers();
      try {
        const { service, hooks, audit } = setup(confirmOutcome);
        const api = { origin: 'api' as const, apiTokenId: 11 };
        const id = (await catchError(service.gateHttp(3, user, {}, api))).getResponse().stepId;
        hooks.runPreStart.mockResolvedValue({ decision: 'allow' });
        await service.gateHttp(3, user, { confirmedStepIds: [id] }, api);
        hooks.runPreStart.mockResolvedValue(confirmOutcome);
        const late = (await catchError(service.gateHttp(3, user, {}, web))).getResponse().stepId;
        jest.advanceTimersByTime(36_000);
        await catchError(service.gateHttp(3, user, { confirmedStepIds: [late] }, web));
        const actions = audit.recordAttractap.mock.calls.map(([event]) => [
          event.action,
          event.details.origin,
          event.authenticationMethod,
        ]);
        expect(actions).toEqual([
          ['ui.step_issued', 'api', 'api-token'],
          ['ui.step_answered', 'api', 'api-token'],
          ['ui.step_issued', 'web', 'session'],
          ['ui.step_expired', 'web', 'session'],
        ]);
        for (const [event] of audit.recordAttractap.mock.calls) {
          expect(projectAttractapAuditEvent(event)).not.toBeNull();
        }
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
