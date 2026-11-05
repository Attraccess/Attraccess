import {
  Resource,
  ResourceFlowNodeType,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
  SupervisionMode,
  User,
} from '@attraccess/database-entities';
import { rm } from 'node:fs/promises';
import { closeResourceTransactionConnection } from '../../../database/run-serialized-transaction';
import { MachineBusyError } from '../errors/machine-busy.error';
import { ResourceInUseError } from '../errors/resource-in-use.error';
import { SessionChangeInterruptedError } from '../errors/session-change-interrupted.error';
import { LOCK_TTL_MS, SessionChangeCoordination } from '../sessions/session-change-coordination';
import { resetTestFixture } from './fixtures/setup.test-fixture';
import { createUsageLifecyclePersistenceAroundExternalFlowsFixture } from './fixtures/state.test-fixture';

jest.setTimeout(30_000);

/** Restarts, other API instances, waiting limits, supervisors and the audit trail of flow-ended sessions. */
describe('Shared machines: restart, waiting and audit', () => {
  const scope = createUsageLifecyclePersistenceAroundExternalFlowsFixture();

  const addUsers = async (count: number, firstId = 10) => {
    const users = await scope.source
      .getRepository(User)
      .save(
        Array.from({ length: count }, (_, index) => ({ id: firstId + index, username: `user-${firstId + index}` })),
      );
    users.forEach((user) => Object.assign(user, { effectivePermissions: new Set(['resources.update']) }));
    return users;
  };
  const setLimit = (maxParallelSessions: number, extra: Partial<Resource> = {}) =>
    scope.source.getRepository(Resource).update(1, { maxParallelSessions, ...extra });
  const attempts = () => scope.source.getRepository(ResourceUsageLifecycleAttempt).find();
  const sessionOwners = async () => (await scope.usage.getActiveSessionsForResource(1)).map((s) => s.userId);

  const parkFlows = (runs = 1) => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let allEntered!: () => void;
    const entered = new Promise<void>((resolve) => (allEntered = resolve));
    let parked = 0;
    for (let index = 0; index < runs; index++) {
      scope.flow.runFlow.mockImplementationOnce(async () => {
        if (++parked === runs) allEntered();
        await released;
      });
    }
    return { entered, release };
  };

  /** The API process restarts: its memory (queue, running changes) is gone, the database stays. */
  const restartApi = () => {
    Reflect.set(scope.usage, 'sessionChangeCoordinationInstance', undefined);
    Reflect.set(scope.usage, 'sessionChangeQueue', new (Reflect.get(scope.usage, 'sessionChangeQueue').constructor)());
  };
  const setWaitMs = (ms: number) => Reflect.set(scope.usage, 'sessionChangeWaitMs', ms);
  const payloads = (type: ResourceFlowNodeType) =>
    scope.flow.runFlow.mock.calls
      .filter((call) => call[1] === type)
      .map((call) => (call[2] as { activeSessions: { before: number; after: number; limit: number } }).activeSessions);

  beforeEach(async () => {
    await resetTestFixture(scope);
  });

  afterEach(async () => {
    scope.usage?.onModuleDestroy();
    if (scope.source) {
      await closeResourceTransactionConnection(scope.source);
      if (scope.source.isInitialized) await scope.source.destroy();
    }
    if (scope.directory) await rm(scope.directory, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  describe.each([
    ['a machine limited to one session', 1],
    ['a shared machine', 3],
  ])('a start in flight during an API restart on %s', (_name, limit) => {
    it('fails with a retryable error, not a 409, and the retry works right away', async () => {
      await setLimit(limit);
      const [other] = await addUsers(1);
      const parked = parkFlows();
      const interrupted = scope.usage.startSession(1, scope.users[0], {});
      const outcome = interrupted.then(
        () => 'started',
        (error: unknown) => error,
      );
      await parked.entered;
      expect(await attempts()).toHaveLength(1);

      restartApi();
      await scope.usage.recoverInterruptedLifecycles();
      expect(await attempts()).toHaveLength(0);
      // The person tries again: no "operation in progress" conflict is left behind.
      await expect(scope.usage.startSession(1, other, {})).resolves.toMatchObject({ userId: other.id });

      parked.release();
      const error = await outcome;
      expect(error).toBeInstanceOf(SessionChangeInterruptedError);
      expect((error as SessionChangeInterruptedError).getStatus()).toBe(503);
      expect(await sessionOwners()).toEqual([other.id]);
      expect(await scope.source.getRepository(ResourceUsage).countBy({ lifecyclePending: true })).toBe(0);
    });
  });

  it('a stop in flight during a restart fails retryable and the session keeps running', async () => {
    await setLimit(3);
    await scope.usage.startSession(1, scope.users[0], {});
    const parked = parkFlows();
    const outcome = scope.usage.endSession(1, scope.users[0], {}).then(
      () => 'ended',
      (error: unknown) => error,
    );
    await parked.entered;
    restartApi();
    await scope.usage.recoverInterruptedLifecycles();
    parked.release();
    expect(await outcome).toBeInstanceOf(SessionChangeInterruptedError);
    expect(await sessionOwners()).toEqual([1]);
    await expect(scope.usage.endSession(1, scope.users[0], {})).resolves.toMatchObject({ userId: 1 });
  });

  describe('with several API instances', () => {
    const otherInstance = (alive: boolean): SessionChangeCoordination => ({
      acquire: async () => async () => undefined,
      keepAlive: () => () => undefined,
      isAlive: async () => alive,
    });

    it('does not abort a start another instance is still working on when this one boots', async () => {
      await setLimit(3);
      const parked = parkFlows();
      const start = scope.usage.startSession(1, scope.users[0], {});
      await parked.entered;
      const [attempt] = await attempts();

      // A second instance boots; the heartbeat of the first one is visible in Valkey.
      Reflect.set(scope.usage, 'sessionChangeCoordinationInstance', otherInstance(true));
      await scope.usage.recoverInterruptedLifecycles();
      expect((await attempts()).map((a) => a.id)).toEqual([attempt.id]);

      parked.release();
      await expect(start).resolves.toMatchObject({ userId: 1 });
      expect(await sessionOwners()).toEqual([1]);
    });

    it('cleans up an attempt whose instance is gone', async () => {
      await setLimit(3);
      const parked = parkFlows();
      const start = scope.usage.startSession(1, scope.users[0], {});
      start.catch(() => undefined);
      await parked.entered;
      Reflect.set(scope.usage, 'sessionChangeCoordinationInstance', otherInstance(false));
      await scope.usage.recoverInterruptedLifecycles();
      expect(await attempts()).toHaveLength(0);
      parked.release();
      await expect(start).rejects.toBeInstanceOf(SessionChangeInterruptedError);
    });

    describe('sweeping attempts whose instance died without a restart cleaning them up', () => {
      const ageAttempts = (seconds: number) =>
        scope.source
          .getRepository(ResourceUsageLifecycleAttempt)
          .createQueryBuilder()
          .update()
          .set({ createdAt: new Date(Date.now() - seconds * 1000) })
          .execute();

      /** A start cut off when its API process died: the attempt and its tentative session stay in the database. */
      const cutOffStart = async () => {
        await setLimit(3);
        const parked = parkFlows();
        const start = scope.usage.startSession(1, scope.users[0], {});
        start.catch(() => undefined);
        await parked.entered;
        return { parked, start };
      };

      it('is scheduled only when Valkey ties several instances to the same machines', async () => {
        const interval = jest.spyOn(global, 'setInterval');
        const sweeps = () => interval.mock.calls.filter(([, ms]) => ms === LOCK_TTL_MS);
        try {
          await scope.usage.onModuleInit();
          expect(sweeps()).toHaveLength(0);
          scope.usage.onModuleDestroy();

          Reflect.set(scope.usage, 'valkeyClient', {
            duplicate: () => ({ on: jest.fn(), subscribe: jest.fn(), disconnect: jest.fn() }),
          });
          await scope.usage.onModuleInit();
          expect(sweeps()).toHaveLength(1);
          scope.usage.onModuleDestroy();
          expect(Reflect.get(scope.usage, 'lifecycleSweepInterval')).toBeNull();
        } finally {
          Reflect.set(scope.usage, 'valkeyClient', undefined);
          interval.mockRestore();
        }
      });

      it('removes it once its heartbeat has expired, so the user can start again', async () => {
        const { parked, start } = await cutOffStart();
        // The process restarted within the heartbeat's time to live: boot recovery still sees a heartbeat.
        restartApi();
        Reflect.set(scope.usage, 'sessionChangeCoordinationInstance', otherInstance(true));
        await scope.usage.recoverInterruptedLifecycles();
        expect(await attempts()).toHaveLength(1);
        await expect(scope.usage.startSession(1, scope.users[0], {})).rejects.toThrow();

        await ageAttempts(60);
        Reflect.set(scope.usage, 'sessionChangeCoordinationInstance', otherInstance(false));
        await scope.usage.recoverInterruptedLifecycles(true);
        expect(await attempts()).toHaveLength(0);
        expect(await scope.source.getRepository(ResourceUsage).countBy({ lifecyclePending: true })).toBe(0);
        await expect(scope.usage.startSession(1, scope.users[0], {})).resolves.toMatchObject({ userId: 1 });
        parked.release();
        await start.catch(() => undefined);
      });

      it('leaves an attempt alone while it is younger than the heartbeat lives, even without a heartbeat yet', async () => {
        const { parked, start } = await cutOffStart();
        Reflect.set(scope.usage, 'sessionChangeCoordinationInstance', otherInstance(false));
        await scope.usage.recoverInterruptedLifecycles(true);
        expect(await attempts()).toHaveLength(1);
        parked.release();
        await expect(start).resolves.toMatchObject({ userId: 1 });
      });

      it('leaves an attempt alone when the heartbeat cannot be looked up', async () => {
        const { parked, start } = await cutOffStart();
        await ageAttempts(60);
        Reflect.set(scope.usage, 'sessionChangeCoordinationInstance', {
          ...otherInstance(false),
          isAlive: async (_id: string, ifUnknown = false) => ifUnknown,
        });
        await scope.usage.recoverInterruptedLifecycles(true);
        expect(await attempts()).toHaveLength(1);
        parked.release();
        await start.catch(() => undefined);
      });

      it('never touches an attempt this instance is still working on', async () => {
        const { parked, start } = await cutOffStart();
        await ageAttempts(60);
        await scope.usage.recoverInterruptedLifecycles(true);
        expect(await attempts()).toHaveLength(1);
        parked.release();
        await expect(start).resolves.toMatchObject({ userId: 1 });
      });
    });

    it('holds the machine through the other instance lock and refuses after the wait', async () => {
      await setLimit(3);
      setWaitMs(80);
      const heldElsewhere = jest.fn();
      Reflect.set(scope.usage, 'sessionChangeCoordinationInstance', {
        ...otherInstance(false),
        acquire: async (_id: number, timeoutMs: number) => {
          heldElsewhere(timeoutMs);
          throw new MachineBusyError();
        },
      });
      await expect(scope.usage.startSession(1, scope.users[0], {})).rejects.toBeInstanceOf(MachineBusyError);
      expect(heldElsewhere).toHaveBeenCalledWith(expect.any(Number));
      expect(scope.flow.runFlow).not.toHaveBeenCalled();
      expect(await attempts()).toHaveLength(0);
    });

    it('keeps limit 1 on its immediate conflict without waiting for any lock', async () => {
      await setLimit(1);
      const acquire = jest.fn();
      Reflect.set(scope.usage, 'sessionChangeCoordinationInstance', { ...otherInstance(false), acquire });
      const parked = parkFlows();
      const first = scope.usage.startSession(1, scope.users[0], {});
      await parked.entered;
      const [second] = await addUsers(1);
      const startedAt = Date.now();
      await expect(scope.usage.startSession(1, second, {})).rejects.toThrow(
        'A usage lifecycle operation is already in progress',
      );
      expect(Date.now() - startedAt).toBeLessThan(1000);
      expect(acquire).not.toHaveBeenCalled();
      parked.release();
      await first;
    });
  });

  describe('waiting longer than the limit', () => {
    it('refuses a start with MachineBusyError and leaves nothing behind; the holder and the next start are fine', async () => {
      await setLimit(3);
      setWaitMs(80);
      const [second, third] = await addUsers(2);
      const parked = parkFlows();
      const holder = scope.usage.startSession(1, scope.users[0], {});
      await parked.entered;
      const startedAt = Date.now();
      await expect(scope.usage.startSession(1, second, {})).rejects.toBeInstanceOf(MachineBusyError);
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(70);
      expect(await attempts()).toHaveLength(1);
      parked.release();
      await holder;
      await expect(scope.usage.startSession(1, third, {})).resolves.toMatchObject({ userId: third.id });
      expect(await sessionOwners()).toEqual([1, third.id]);
    });

    it('refuses a stop the same way and the session stays', async () => {
      await setLimit(3);
      const [second] = await addUsers(1);
      await scope.usage.startSession(1, scope.users[0], {});
      await scope.usage.startSession(1, second, {});
      setWaitMs(80);
      const parked = parkFlows();
      const holder = scope.usage.endSession(1, scope.users[0], {});
      await parked.entered;
      await expect(scope.usage.endSession(1, second, {})).rejects.toBeInstanceOf(MachineBusyError);
      parked.release();
      await holder;
      expect(await sessionOwners()).toEqual([second.id]);
    });

    it('does not make a machine limited to one session wait at all', async () => {
      await setLimit(1);
      setWaitMs(60_000);
      const parked = parkFlows();
      const first = scope.usage.startSession(1, scope.users[0], {});
      await parked.entered;
      const [second] = await addUsers(1);
      const startedAt = Date.now();
      await expect(scope.usage.startSession(1, second, {})).rejects.toThrow();
      expect(Date.now() - startedAt).toBeLessThan(2000);
      parked.release();
      await first;
      await expect(scope.usage.startSession(1, second, {})).rejects.toBeInstanceOf(ResourceInUseError);
    });
  });

  describe('supervisors in the session counts', () => {
    beforeEach(() => {
      jest.spyOn(scope.usage, 'validateSupervisedStart').mockResolvedValue(undefined);
    });

    it('never counts the supervisor: a supervised session is one session, the supervisee`s', async () => {
      await setLimit(4, { supervisionMode: SupervisionMode.SUPERVISION_ALLOWED });
      const [supervisee, other] = await addUsers(2);
      await scope.usage.startSession(1, supervisee, {}, { supervisorUserId: 1 });
      await scope.usage.startSession(1, other, {});
      // The supervisor now starts their own session next to the one they supervise.
      await scope.usage.startSession(1, scope.users[0], {});
      await scope.usage.endSession(1, supervisee, {});
      await scope.usage.endSession(1, other, {});
      await scope.usage.endSession(1, scope.users[0], {});
      expect(payloads(ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED)).toEqual([
        { before: 0, after: 1, limit: 4 },
        { before: 1, after: 2, limit: 4 },
        { before: 2, after: 3, limit: 4 },
      ]);
      expect(payloads(ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED)).toEqual([
        { before: 3, after: 2, limit: 4 },
        { before: 2, after: 1, limit: 4 },
        { before: 1, after: 0, limit: 4 },
      ]);
    });

    it('reports a supervised first start and last stop as the first and last of the machine', async () => {
      await setLimit(2, { supervisionMode: SupervisionMode.SUPERVISION_ALLOWED });
      const [supervisee] = await addUsers(1);
      await scope.usage.startSession(1, supervisee, {}, { supervisorUserId: 1 });
      await scope.usage.endSession(1, scope.users[0], {
        usageId: (await scope.usage.getActiveSessionsForResource(1))[0].id,
      });
      expect(payloads(ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED)).toEqual([{ before: 0, after: 1, limit: 2 }]);
      expect(payloads(ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED)).toEqual([{ before: 1, after: 0, limit: 2 }]);
    });
  });

  describe('audit of sessions ended by a flow', () => {
    const auditCalls = () =>
      (Reflect.get(scope.usage, 'audit').recordResource as jest.Mock).mock.calls
        .map(([event]) => event as { action: string; actorId: number | null; details: Record<string, unknown> })
        .filter((event) => event.action === 'usage_session.ended');

    it('records the user whose action triggered the flow on every ended session', async () => {
      await setLimit(3);
      const [second] = await addUsers(1);
      await scope.usage.startSession(1, scope.users[0], {});
      await scope.usage.startSession(1, second, {});
      await scope.usage.endSessionsOfTarget(1, { kind: 'all' }, 'closing', undefined, second.id);
      expect(auditCalls()).toHaveLength(2);
      for (const event of auditCalls()) {
        expect(event).toMatchObject({ actorId: null, details: { triggeredByUserId: second.id } });
      }
    });

    it('records it for ends deferred out of a start flow too', async () => {
      await setLimit(3);
      const [other] = await addUsers(1);
      await scope.usage.startSession(1, other, {});
      scope.flow.runFlow.mockImplementationOnce(async (resourceId, _type, _payload, _manager, options) => {
        await scope.usage.deferSessionEnds(
          options?.lifecycleAttemptId as string,
          resourceId as number,
          { kind: 'user', userId: other.id },
          'flow',
          undefined,
          scope.users[0].id,
        );
      });
      await scope.usage.startSession(1, scope.users[0], {});
      expect(auditCalls()).toEqual([
        expect.objectContaining({
          actorId: null,
          details: expect.objectContaining({ usageUserId: other.id, triggeredByUserId: 1 }),
        }),
      ]);
    });

    it('leaves ordinary ends without it', async () => {
      await setLimit(3);
      await scope.usage.startSession(1, scope.users[0], {});
      await scope.usage.endSession(1, scope.users[0], {});
      expect(auditCalls()[0].details).not.toHaveProperty('triggeredByUserId');
    });
  });
});
