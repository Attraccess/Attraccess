import type { StartCapacityHook } from '@attraccess/plugins-backend-sdk';
import { ReaderUiHooksService, type StartCapacityRun } from './reader-ui-hooks.service';

const reason = { code: 'RESERVED', title: 'Reserved', body: 'Held for a booking' };

function setup(hooks: Record<string, StartCapacityHook>, policy: 'fail-closed' | 'fail-open' = 'fail-closed') {
  const registry = {
    startCapacityHooks: () => Object.entries(hooks).map(([plugin, hook]) => ({ plugin, hook })),
  };
  const settings = { failurePolicy: jest.fn().mockResolvedValue(policy) };
  const alerts = {
    onCleared: jest.fn(),
    raise: jest.fn().mockResolvedValue({}),
    clearWhere: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new ReaderUiHooksService(
    registry as never,
    settings as never,
    alerts as never,
    audit as never,
    { get: () => ({}) } as never,
  );
  return { service, audit };
}

const run = (occupiedSlots: number, satisfied: StartCapacityRun['satisfied'] = new Map()): StartCapacityRun => ({
  resourceId: 3,
  userId: 7,
  principal: 7,
  action: 'start',
  origin: 'web',
  language: 'en',
  sessionLimit: 3,
  occupiedSlots,
  manager: { marker: 'manager' } as never,
  satisfied,
});

describe('ReaderUiHooksService.runStartCapacity', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('passes the transaction manager, the limit, the occupied slots and only the plugin own step keys', async () => {
    const hook = jest.fn().mockResolvedValue({ heldSlots: 0 });
    const { service } = setup({ reservations: hook });
    await service.runStartCapacity(
      run(
        1,
        new Map([
          ['reservations', new Set(['override-4'])],
          ['other', new Set(['x'])],
        ]),
      ),
    );
    expect(hook).toHaveBeenCalledWith(
      expect.objectContaining({
        manager: { marker: 'manager' },
        sessionLimit: 3,
        occupiedSlots: 1,
        confirmedStepKeys: ['override-4'],
        resourceId: 3,
        userId: 7,
      }),
    );
  });

  it('refuses with the plugin reason when occupied + held reaches the limit, and audits it after the fact', async () => {
    const { service, audit } = setup({ reservations: () => ({ heldSlots: 1, reason }) });
    const outcome = await service.runStartCapacity(run(2));
    expect(outcome.refusal).toEqual({ plugin: 'reservations', reason });
    expect(audit.record).not.toHaveBeenCalled();
    await outcome.flush();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'attractap.ui.hook_decision',
        details: expect.objectContaining({ plugin: 'reservations', decision: 'block', reasonCode: 'RESERVED' }),
      }),
    );
  });

  it('allows while a slot stays free', async () => {
    const { service } = setup({ reservations: () => ({ heldSlots: 1, reason }) });
    expect((await service.runStartCapacity(run(1))).refusal).toBeNull();
  });

  it('refuses with the host text when a hook fails under fail-closed', async () => {
    const { service, audit } = setup({
      reservations: () => {
        throw new Error('boom');
      },
    });
    const outcome = await service.runStartCapacity(run(0));
    expect(outcome.refusal).toMatchObject({ plugin: 'reservations', reason: { code: 'HOOK_UNAVAILABLE' } });
    await outcome.flush();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ details: expect.objectContaining({ decision: 'block', reasonCode: 'exception' }) }),
    );
  });

  it('skips a failing hook under fail-open and audits the fail-open', async () => {
    const { service, audit } = setup(
      {
        reservations: () => {
          throw new Error('boom');
        },
      },
      'fail-open',
    );
    const outcome = await service.runStartCapacity(run(2));
    expect(outcome.refusal).toBeNull();
    await outcome.flush();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'attractap.ui.fail_open_used' }));
  });

  it('treats a result that is not a non-negative integer as a failure', async () => {
    const { service } = setup({ reservations: () => ({ heldSlots: -1 }) as never });
    expect((await service.runStartCapacity(run(0))).refusal).toMatchObject({ reason: { code: 'HOOK_UNAVAILABLE' } });
  });

  it('times out a slow hook', async () => {
    const { service } = setup({ reservations: () => new Promise(() => undefined) });
    const pending = service.runStartCapacity(run(0));
    await jest.advanceTimersByTimeAsync(5000);
    expect((await pending).refusal).toMatchObject({ reason: { code: 'HOOK_UNAVAILABLE' } });
  });
});
