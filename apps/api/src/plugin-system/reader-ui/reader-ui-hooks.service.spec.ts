/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PreStartHook, PreStartResult } from '@attraccess/plugins-backend-sdk';
import { ReaderUiHooksService, type PreStartRun } from './reader-ui-hooks.service';

const allow: PreStartResult = { decision: 'allow' };
const confirm = (stepKey: string): PreStartResult => ({
  decision: 'confirm',
  confirmation: { stepKey, title: 'Reserved from 14:00', body: 'Start anyway?' },
});
const block: PreStartResult = { decision: 'block', reason: { code: 'RESERVED', title: 'Reserved', body: 'Not now' } };

const config = (app: Record<string, unknown> = {}) => ({ get: () => app }) as never;

function setup(
  hooks: Record<string, PreStartHook>,
  policy: 'fail-closed' | 'fail-open' = 'fail-closed',
  sessionEndHooks: Record<string, () => unknown> = {},
) {
  const registry = {
    preStartHooks: () => Object.entries(hooks).map(([plugin, hook]) => ({ plugin, hook })),
    sessionEndHooks: () => Object.entries(sessionEndHooks).map(([plugin, hook]) => ({ plugin, hook })),
  };
  const settings = { failurePolicy: jest.fn().mockResolvedValue(policy) };
  const cleared: Array<(a: { kind: string; plugin: string }) => void> = [];
  const alerts = {
    onCleared: (cb: (a: { kind: string; plugin: string }) => void) => cleared.push(cb),
    raise: jest.fn().mockResolvedValue({}),
    clearWhere: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { recordAttractap: jest.fn().mockResolvedValue(undefined) };
  const service = new ReaderUiHooksService(
    registry as never,
    settings as never,
    alerts as never,
    audit as never,
    config(),
  );
  return { service, alerts, audit, settings, cleared };
}

const run = (satisfied: PreStartRun['satisfied'] = new Map()): PreStartRun => ({
  resourceId: 3,
  userId: 7,
  action: 'start',
  origin: 'reader',
  language: 'en',
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

  it('takes timeout and breaker threshold from the app config, never exceeding the 3 s cap', async () => {
    const make = (app: Record<string, unknown>, hook: PreStartHook = () => allow) =>
      new ReaderUiHooksService(
        { preStartHooks: () => [{ plugin: 'p', hook }], sessionEndHooks: () => [] } as never,
        { failurePolicy: jest.fn().mockResolvedValue('fail-closed') } as never,
        { onCleared: jest.fn(), raise: jest.fn().mockResolvedValue({}), clearWhere: jest.fn() } as never,
        { recordAttractap: jest.fn().mockResolvedValue(undefined) } as never,
        config(app),
      );
    expect(make({ READER_UI_HOOK_TIMEOUT_MS: 9000 }).timeoutMs).toBe(3000);
    expect(make({ READER_UI_HOOK_TIMEOUT_MS: 800 }).timeoutMs).toBe(800);
    expect(make({}).timeoutMs).toBe(1500);
    let calls = 0;
    const service = make({ READER_UI_BREAKER_THRESHOLD: 2 }, () => {
      calls += 1;
      throw new Error('down');
    });
    for (let i = 0; i < 3; i += 1) await service.runPreStart(run());
    expect(calls).toBe(2);
  });

  it('passes the language and answers a failure with the host text in that language', async () => {
    const seen: string[] = [];
    const { service } = setup({
      p: (ctx) => {
        seen.push(ctx.language);
        throw new Error('x');
      },
    });
    const outcome = await service.runPreStart({ ...run(), language: 'de' });
    expect(seen).toEqual(['de']);
    expect(outcome).toMatchObject({ reason: { code: 'HOOK_UNAVAILABLE', title: 'Vorübergehend nicht startbar' } });
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
        details: expect.objectContaining({
          plugin: 'boom',
          userId: 7,
          resourceId: 3,
          readerId: 5,
          cardSessionId: 'cs1',
        }),
      }),
    );
  });

  it('treats an invalid hook result as a failure', async () => {
    const { service } = setup({ odd: () => ({ decision: 'maybe' }) as never });
    await expect(service.runPreStart(run())).resolves.toMatchObject({ decision: 'block' });
  });

  it('runs an invalid result through the failure policy: fail-open is honoured and audited', async () => {
    const { service, audit } = setup({ odd: () => ({ decision: 'maybe' }) as never }, 'fail-open');
    await expect(service.runPreStart(run())).resolves.toEqual({ decision: 'allow' });
    expect(audit.recordAttractap).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ui.fail_open_used',
        details: expect.objectContaining({ reasonCode: 'invalid-result' }),
      }),
    );
  });

  it('counts invalid results towards the circuit breaker', async () => {
    let calls = 0;
    const { service, alerts } = setup({
      odd: () => {
        calls += 1;
        return { decision: 'maybe' } as never;
      },
    });
    for (let i = 0; i < 6; i += 1) await service.runPreStart(run());
    expect(calls).toBe(5);
    expect(alerts.raise).toHaveBeenCalledWith('breaker-open', expect.any(String), { plugin: 'odd' });
  });

  it.each([
    ['a bad tone', { tone: 'neon' }],
    ['a NaN expiry', { expiresInSec: Number.NaN }],
    ['an unknown no-screen policy', { noScreenPolicy: 'sometimes' }],
    ['an invalid countdown', { countdownTo: new Date('nope') }],
    ['a bad step key', { stepKey: 'Not Valid!' }],
    ['a too long label', { confirmLabel: 'x'.repeat(40) }],
    ['a spoofing label', { cancelLabel: 'In use' }],
  ])('treats a confirmation with %s as a hook failure', async (_name, extra) => {
    const { service } = setup({
      p: () => ({ decision: 'confirm', confirmation: { ...(confirm('k') as any).confirmation, ...extra } }),
    });
    await expect(service.runPreStart(run())).resolves.toMatchObject({
      decision: 'block',
      reason: { code: 'HOOK_UNAVAILABLE' },
    });
  });

  it('clamps the confirmation expiry to [10, 120] s', async () => {
    const outcome = async (expiresInSec: number) =>
      (await setup({
        p: () => ({ decision: 'confirm', confirmation: { ...(confirm('k') as any).confirmation, expiresInSec } }),
      }).service.runPreStart(run())) as any;
    expect((await outcome(1)).confirmation.expiresInSec).toBe(10);
    expect((await outcome(9999)).confirmation.expiresInSec).toBe(120);
    expect((await outcome(45)).confirmation.expiresInSec).toBe(45);
  });

  it('rejects text that spoofs core status strings', async () => {
    const { service } = setup({
      spoof: () => ({ decision: 'block', reason: { code: 'X', title: 'Maintenance', body: 'b' } }),
    });
    await expect(service.runPreStart(run())).resolves.toMatchObject({
      decision: 'block',
      reason: { code: 'HOOK_UNAVAILABLE' },
    });
  });

  describe('block with an invalid reason', () => {
    const invalidBlocks: Array<[string, PreStartResult]> = [
      ['a spoofing title', { decision: 'block', reason: { code: 'X', title: 'Maintenance', body: 'b' } }],
      ['a missing reason', { decision: 'block' } as never],
      ...['CONFIRMATION_REQUIRED', 'CONFIRMATION_UNAVAILABLE', 'HOOK_UNAVAILABLE', 'STEP_EXPIRED', 'STEP_UNKNOWN'].map(
        (code): [string, PreStartResult] => [
          `the host code ${code}`,
          { decision: 'block', reason: { code, title: 'Reserved', body: 'Not now' } },
        ],
      ),
    ];

    it.each(invalidBlocks)('still blocks under fail-open (%s), with the host reason', async (_name, result) => {
      const { service, audit } = setup({ p: () => result }, 'fail-open');
      await expect(service.runPreStart({ ...run(), language: 'de' })).resolves.toEqual({
        decision: 'block',
        plugin: 'p',
        reason: { code: 'HOOK_UNAVAILABLE', title: 'Vorübergehend nicht startbar', body: expect.any(String) },
      });
      expect(audit.recordAttractap).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ui.hook_decision',
          details: expect.objectContaining({ decision: 'block', reasonCode: 'invalid-result' }),
        }),
      );
      expect(audit.recordAttractap).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'ui.fail_open_used' }));
    });

    it('counts neither as a breaker failure nor as a success', async () => {
      let mode: 'throw' | 'invalid-block' = 'throw';
      let calls = 0;
      const { service, alerts } = setup({
        p: () => {
          calls += 1;
          if (mode === 'throw') throw new Error('down');
          return { decision: 'block', reason: { code: 'HOOK_UNAVAILABLE', title: 'Reserved', body: 'b' } };
        },
      });
      for (let i = 0; i < 4; i += 1) await service.runPreStart(run());
      mode = 'invalid-block';
      for (let i = 0; i < 10; i += 1) await service.runPreStart(run());
      expect(alerts.raise).not.toHaveBeenCalled(); // not failures
      mode = 'throw';
      await service.runPreStart(run());
      expect(alerts.raise).toHaveBeenCalledWith('breaker-open', expect.any(String), { plugin: 'p' }); // no reset
      expect(calls).toBe(15);
    });
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

describe('ReaderUiHooksService.runSessionEnd', () => {
  const ctx = { resourceId: 3, userId: 7, sessionId: 11, origin: 'reader' as const, language: 'en' as const };
  const choice = (overrides: Record<string, unknown> = {}) => ({
    decision: 'choose' as const,
    choice: {
      stepKey: 'free-rest',
      title: 'Free the rest?',
      body: 'Release your booking',
      choices: [
        { id: 'keep', label: 'Keep' },
        { id: 'free', label: 'Free' },
      ],
      defaultOnTimeout: 'keep',
      onAnswer: jest.fn(),
      ...overrides,
    },
  });

  function setupEnd(hooks: Record<string, () => unknown>) {
    const registry = {
      preStartHooks: () => [],
      sessionEndHooks: () => Object.entries(hooks).map(([plugin, hook]) => ({ plugin, hook })),
    };
    const settings = { failurePolicy: jest.fn().mockResolvedValue('fail-closed') };
    const alerts = {
      onCleared: jest.fn(),
      raise: jest.fn().mockResolvedValue({}),
      clearWhere: jest.fn().mockResolvedValue(undefined),
    };
    const audit = { recordAttractap: jest.fn().mockResolvedValue(undefined) };
    return new ReaderUiHooksService(registry as never, settings as never, alerts as never, audit as never, config());
  }

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns null when no hook asks a question', async () => {
    const service = setupEnd({ a: () => ({ decision: 'none' }) });
    await expect(service.runSessionEnd(ctx)).resolves.toBeNull();
  });

  it('returns null when there are no hooks', async () => {
    await expect(setupEnd({}).runSessionEnd(ctx)).resolves.toBeNull();
  });

  it('returns the first valid choice with its plugin', async () => {
    const service = setupEnd({ a: () => choice() });
    await expect(service.runSessionEnd(ctx)).resolves.toMatchObject({ plugin: 'a', result: { decision: 'choose' } });
  });

  it.each([
    ['no choices', { choices: [] }],
    [
      'too many choices',
      { choices: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, label: id })), defaultOnTimeout: 'a' },
    ],
    ['default not among the choices', { defaultOnTimeout: 'nope' }],
    ['choices not an array', { choices: undefined }],
  ])('ignores an invalid choice (%s)', async (_name, overrides) => {
    const service = setupEnd({ a: () => choice(overrides) });
    await expect(service.runSessionEnd(ctx)).resolves.toBeNull();
  });

  it('skips a failing hook and falls through to the next plugin', async () => {
    const service = setupEnd({
      broken: () => {
        throw new Error('down');
      },
      b: () => choice(),
    });
    await expect(service.runSessionEnd(ctx)).resolves.toMatchObject({ plugin: 'b' });
  });

  it('uses the second plugin when the first returns an invalid choice', async () => {
    const service = setupEnd({ a: () => choice({ choices: [] }), b: () => choice() });
    await expect(service.runSessionEnd(ctx)).resolves.toMatchObject({ plugin: 'b' });
  });

  it('asks every plugin, shows the first question and applies the default for the others', async () => {
    const first = choice();
    const second = choice({ defaultOnTimeout: 'free' });
    const service = setupEnd({ a: () => first, b: () => second });
    const asked = await service.runSessionEnd(ctx);
    expect(asked).toMatchObject({ plugin: 'a' });
    await jest.advanceTimersByTimeAsync(0);
    expect(second.choice.onAnswer).toHaveBeenCalledWith('free');
    expect(first.choice.onAnswer).not.toHaveBeenCalled();
  });

  it('guards onAnswer: at most once, bounded by the hook timeout, never rejecting', async () => {
    const throwing = choice({ onAnswer: jest.fn().mockRejectedValue(new Error('boom')) });
    const asked = await setupEnd({ a: () => throwing }).runSessionEnd(ctx);
    await expect(asked?.result.choice.onAnswer('keep')).resolves.toBeUndefined();
    await asked?.result.choice.onAnswer('free');
    expect(throwing.choice.onAnswer).toHaveBeenCalledTimes(1);

    const hanging = choice({ onAnswer: jest.fn(() => new Promise(() => undefined)) });
    const slow = await setupEnd({ a: () => hanging }).runSessionEnd(ctx);
    const pending = slow?.result.choice.onAnswer('keep');
    await jest.advanceTimersByTimeAsync(1501);
    await expect(pending).resolves.toBeUndefined();
  });

  it('clamps the question expiry to 30 s and defaults it to 15 s', async () => {
    const long = await setupEnd({ a: () => choice({ expiresInSec: 600 }) }).runSessionEnd(ctx);
    expect(long?.result.choice.expiresInSec).toBe(30);
    const plain = await setupEnd({ a: () => choice() }).runSessionEnd(ctx);
    expect(plain?.result.choice.expiresInSec).toBe(15);
  });

  it('never lets a failing advisory hook open the pre-start breaker', async () => {
    let preStartCalls = 0;
    const { service, alerts } = setup(
      {
        p: () => {
          preStartCalls += 1;
          return allow;
        },
      },
      'fail-closed',
      {
        p: () => {
          throw new Error('down');
        },
      },
    );
    for (let i = 0; i < 8; i += 1) await service.runSessionEnd(ctx);
    await expect(service.runPreStart(run())).resolves.toEqual({ decision: 'allow' });
    expect(preStartCalls).toBe(1);
    expect(alerts.raise).not.toHaveBeenCalled();
  });
});
