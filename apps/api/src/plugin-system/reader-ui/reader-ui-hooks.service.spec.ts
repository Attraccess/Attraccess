import type { PreStartHook, PreStartResult } from '@attraccess/plugins-backend-sdk';
import { ReaderUiHooksService, type PreStartRun } from './reader-ui-hooks.service';

const allow: PreStartResult = { decision: 'allow' };
const confirm = (stepKey: string): PreStartResult => ({
  decision: 'confirm',
  confirmation: { stepKey, title: 'Reserved from 14:00', body: 'Start anyway?' },
});
const block: PreStartResult = { decision: 'block', reason: { code: 'RESERVED', title: 'Reserved', body: 'Not now' } };

function setup(hooks: Record<string, PreStartHook>, policy: 'fail-closed' | 'fail-open' = 'fail-closed') {
  const registry = {
    preStartHooks: () => Object.entries(hooks).map(([plugin, hook]) => ({ plugin, hook })),
    sessionEndHooks: () => [],
  };
  const settings = { failurePolicy: jest.fn().mockResolvedValue(policy) };
  const cleared: Array<(a: { kind: string; plugin: string }) => void> = [];
  const alerts = {
    onCleared: (cb: (a: { kind: string; plugin: string }) => void) => cleared.push(cb),
    raise: jest.fn().mockResolvedValue({}),
    clearWhere: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { recordAttractap: jest.fn().mockResolvedValue(undefined) };
  const service = new ReaderUiHooksService(registry as never, settings as never, alerts as never, audit as never);
  return { service, alerts, audit, settings, cleared };
}

const run = (satisfied: PreStartRun['satisfied'] = new Map()): PreStartRun => ({
  resourceId: 3,
  userId: 7,
  action: 'start',
  origin: 'reader',
  readerId: 5,
  cardSessionId: 'cs1',
  satisfied,
});

describe('ReaderUiHooksService', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('allows when every hook allows', async () => {
    const { service } = setup({ a: () => allow, b: async () => allow });
    await expect(service.runPreStart(run())).resolves.toEqual({ decision: 'allow' });
  });

  it('lets block win over confirm regardless of order', async () => {
    const { service } = setup({ a: () => confirm('k'), b: () => block });
    const outcome = await service.runPreStart(run());
    expect(outcome).toMatchObject({ decision: 'block', plugin: 'b', reason: { code: 'RESERVED' } });
  });

  it('asks two confirming plugins in host order and then starts without looping', async () => {
    const hooks = {
      a: (ctx: { confirmedStepKeys: string[] }) => (ctx.confirmedStepKeys.includes('ka') ? allow : confirm('ka')),
      b: (ctx: { confirmedStepKeys: string[] }) => (ctx.confirmedStepKeys.includes('kb') ? allow : confirm('kb')),
    };
    const { service } = setup(hooks);
    const first = await service.runPreStart(run());
    expect(first).toMatchObject({ decision: 'confirm', plugin: 'a' });
    const second = await service.runPreStart(run(new Map([['a', new Set(['ka'])]])));
    expect(second).toMatchObject({ decision: 'confirm', plugin: 'b' });
    const third = await service.runPreStart(
      run(
        new Map([
          ['a', new Set(['ka'])],
          ['b', new Set(['kb'])],
        ]),
      ),
    );
    expect(third).toEqual({ decision: 'allow' });
  });

  it('treats a plugin that confirms an already confirmed key again as satisfied', async () => {
    const { service } = setup({ a: () => confirm('ka') });
    await expect(service.runPreStart(run(new Map([['a', new Set(['ka'])]])))).resolves.toEqual({ decision: 'allow' });
  });

  it('only passes a plugin its own confirmed step keys', async () => {
    const seen: string[][] = [];
    const { service } = setup({
      a: (ctx) => (seen.push(ctx.confirmedStepKeys), allow),
      b: (ctx) => (seen.push(ctx.confirmedStepKeys), allow),
    });
    await service.runPreStart(run(new Map([['a', new Set(['ka'])]])));
    expect(seen).toEqual([['ka'], []]);
  });

  it('blocks fail-closed on a timeout and on an exception', async () => {
    const { service } = setup({ slow: () => new Promise(() => undefined) });
    const pending = service.runPreStart(run());
    await jest.advanceTimersByTimeAsync(service.timeoutMs + 1);
    await expect(pending).resolves.toMatchObject({ decision: 'block', reason: { code: 'HOOK_UNAVAILABLE' } });

    const thrower = setup({
      boom: () => {
        throw new Error('x');
      },
    });
    await expect(thrower.service.runPreStart(run())).resolves.toMatchObject({
      decision: 'block',
      reason: { code: 'HOOK_UNAVAILABLE' },
    });
  });

  it('never exceeds the 3 s cap even when configured higher', () => {
    process.env.READER_UI_HOOK_TIMEOUT_MS = '9000';
    const { service } = setup({});
    expect(service.timeoutMs).toBe(3000);
    delete process.env.READER_UI_HOOK_TIMEOUT_MS;
  });

  it('allows and audits a failing hook when the admin chose fail-open', async () => {
    const { service, audit } = setup(
      {
        boom: () => {
          throw new Error('x');
        },
      },
      'fail-open',
    );
    await expect(service.runPreStart(run())).resolves.toEqual({ decision: 'allow' });
    expect(audit.recordAttractap).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ui.fail_open_used',
        details: expect.objectContaining({ plugin: 'boom', userId: 7, resourceId: 3, readerId: 5, cardSessionId: 'cs1' }),
      }),
    );
  });

  it('treats an invalid hook result as a failure', async () => {
    const { service } = setup({ odd: () => ({ decision: 'maybe' }) as never });
    await expect(service.runPreStart(run())).resolves.toMatchObject({ decision: 'block' });
  });

  it('rejects text that spoofs core status strings', async () => {
    const { service } = setup({
      spoof: () => ({ decision: 'block', reason: { code: 'X', title: 'Maintenance', body: 'b' } }),
    });
    await expect(service.runPreStart(run())).resolves.toMatchObject({ decision: 'block', reason: { code: 'HOOK_UNAVAILABLE' } });
  });

  describe('circuit breaker', () => {
    it('opens after 5 failures, stops calling the hook, raises an alert and probes after 60 s', async () => {
      let calls = 0;
      let healthy = false;
      const { service, alerts } = setup({
        flaky: () => {
          calls += 1;
          if (!healthy) throw new Error('down');
          return allow;
        },
      });
      for (let i = 0; i < 5; i += 1) await service.runPreStart(run());
      expect(calls).toBe(5);
      expect(alerts.raise).toHaveBeenCalledWith('breaker-open', expect.any(String), { plugin: 'flaky' });

      await expect(service.runPreStart(run())).resolves.toMatchObject({ decision: 'block' });
      expect(calls).toBe(5); // open: failure policy applied without calling the hook

      healthy = true;
      await jest.advanceTimersByTimeAsync(60_001);
      await expect(service.runPreStart(run())).resolves.toEqual({ decision: 'allow' });
      expect(calls).toBe(6);
      expect(alerts.clearWhere).toHaveBeenCalledWith('breaker-open', { plugin: 'flaky' });
    });

    it('applies fail-open without calling the hook while open, and an admin reset closes it', async () => {
      let calls = 0;
      const { service, cleared } = setup(
        {
          flaky: () => {
            calls += 1;
            throw new Error('down');
          },
        },
        'fail-open',
      );
      for (let i = 0; i < 6; i += 1) await service.runPreStart(run());
      expect(calls).toBe(5);
      cleared.forEach((cb) => cb({ kind: 'breaker-open', plugin: 'flaky' }));
      await service.runPreStart(run());
      expect(calls).toBe(6);
    });
  });
});
