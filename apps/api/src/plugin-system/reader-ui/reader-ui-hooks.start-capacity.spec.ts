import type { StartCapacityHook } from '@attraccess/plugins-backend-sdk';
import { createSqlitePluginPersistence, sqlitePersistence } from '@attraccess/plugins-backend-sdk/sqlite';
import { ScopedUnitOfWork, type TransactionScope } from '../../database/unit-of-work';
import { ReaderUiHooksService, type StartCapacityRun } from './reader-ui-hooks.service';

const reason = { code: 'RESERVED', title: 'Reserved', body: 'Held for a booking' };

// The host's start transaction stays open for the whole file, as it is while the capacity hooks run.
const unitOfWork = new ScopedUnitOfWork<object>({ transaction: (work) => work({ marker: 'manager' }) });
let hostScope!: TransactionScope;
void unitOfWork.run((scope) => {
  hostScope = scope;
  return new Promise<void>(() => undefined);
});

function setup(hooks: Record<string, StartCapacityHook>, policy: 'fail-closed' | 'fail-open' = 'fail-closed') {
  const registry = {
    startCapacityHooks: () => Object.entries(hooks).map(([plugin, hook]) => ({ plugin, hook })),
  };
  const settings = { failurePolicy: jest.fn().mockResolvedValue(policy) };
  const cleared: Array<(alert: { kind: string; plugin: string }) => void> = [];
  const alerts = {
    onCleared: (cb: (alert: { kind: string; plugin: string }) => void) => cleared.push(cb),
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
    unitOfWork,
  );
  return { service, audit, alerts, cleared };
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
  usersInSession: [11, 12, 13].slice(0, occupiedSlots),
  scope: hostScope,
  satisfied,
});

describe('ReaderUiHooksService.runStartCapacity', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('passes the host transaction scope, the limit, the occupied slots and only the plugin own step keys', async () => {
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
        scope: expect.objectContaining({ isOpen: true }),
        sessionLimit: 3,
        occupiedSlots: 1,
        usersInSession: [11],
        confirmedStepKeys: ['override-4'],
        resourceId: 3,
        userId: 7,
      }),
    );
    // The plugin reads the host's own transaction through the engine subpath.
    const [{ scope }] = hook.mock.calls[0];
    const persistence = createSqlitePluginPersistence({
      pluginName: 'reservations',
      connection: () => {
        throw new Error('unused');
      },
    });
    expect(sqlitePersistence({ persistence }).managerOf(scope)).toEqual({ marker: 'manager' });
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

  it('times out a slow hook and audits the refusal with reason code timeout', async () => {
    const { service, audit } = setup({ reservations: () => new Promise(() => undefined) });
    const pending = service.runStartCapacity(run(0));
    await jest.advanceTimersByTimeAsync(5000);
    const outcome = await pending;
    expect(outcome.refusal).toMatchObject({ reason: { code: 'HOOK_UNAVAILABLE' } });
    await outcome.flush();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'attractap.ui.hook_decision',
        details: expect.objectContaining({ plugin: 'reservations', decision: 'block', reasonCode: 'timeout' }),
      }),
    );
  });

  describe('circuit breaker', () => {
    const failing = () => {
      const hook = jest.fn(() => {
        throw new Error('down');
      });
      return hook;
    };
    const runTimes = async (service: ReaderUiHooksService, times: number) => {
      for (let i = 0; i < times; i += 1) await (await service.runStartCapacity(run(0))).flush();
    };

    it('opens after repeated failures: the hook is no longer called and fail-closed still refuses', async () => {
      const hook = failing();
      const { service, audit, alerts } = setup({ reservations: hook });
      await runTimes(service, 5);
      expect(hook).toHaveBeenCalledTimes(5);
      expect(alerts.raise).toHaveBeenCalledWith('breaker-open', expect.any(String), { plugin: 'reservations' });

      const outcome = await service.runStartCapacity(run(0));
      expect(hook).toHaveBeenCalledTimes(5);
      expect(outcome.refusal).toMatchObject({ plugin: 'reservations', reason: { code: 'HOOK_UNAVAILABLE' } });
      await outcome.flush();
      expect(audit.record).toHaveBeenLastCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({ decision: 'block', reasonCode: 'breaker-open' }),
        }),
      );
    });

    it('applies fail-open while open without calling the hook', async () => {
      const hook = failing();
      const { service } = setup({ reservations: hook }, 'fail-open');
      await runTimes(service, 5);
      expect((await service.runStartCapacity(run(0))).refusal).toBeNull();
      expect(hook).toHaveBeenCalledTimes(5);
    });

    it('closes when the breaker alert is cleared or an admin resets the plugin', async () => {
      const hook = failing();
      const { service, cleared } = setup({ reservations: hook });
      await runTimes(service, 5);
      cleared.forEach((cb) => cb({ kind: 'breaker-open', plugin: 'reservations' }));
      await service.runStartCapacity(run(0));
      expect(hook).toHaveBeenCalledTimes(6);

      await runTimes(service, 4);
      expect(hook).toHaveBeenCalledTimes(10);
      await service.runStartCapacity(run(0));
      expect(hook).toHaveBeenCalledTimes(10); // open again
      await service.resetBreaker('reservations');
      await service.runStartCapacity(run(0));
      expect(hook).toHaveBeenCalledTimes(11);
    });
  });
});
