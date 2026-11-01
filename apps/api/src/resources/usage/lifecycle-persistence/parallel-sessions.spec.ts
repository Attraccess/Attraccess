import {
  Resource,
  ResourceFlowNodeType,
  ResourceType,
  ResourceUsage,
  ResourceUsageAction,
  ResourceUsageLifecycleAttempt,
  SupervisionMode,
  User,
} from '@attraccess/database-entities';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import { closeResourceTransactionConnection } from '../../../database/run-serialized-transaction';
import { ResourceUsageImpossibleMaintenanceInProgressException } from '../../../exceptions/resource.maintenance.inUse.exception';
import { ResourceUnhealthyException } from '../../../exceptions/resource.unhealthy.exception';
import { AlreadyHasActiveSessionError } from '../errors/already-has-active-session.error';
import { NoOwnActiveSessionError } from '../errors/no-own-active-session.error';
import { ResourceFullError } from '../errors/resource-full.error';
import { ResourceInUseError } from '../errors/resource-in-use.error';
import { resetTestFixture } from './fixtures/setup.test-fixture';
import { createUsageLifecyclePersistenceAroundExternalFlowsFixture } from './fixtures/state.test-fixture';

jest.setTimeout(30_000);

describe('Parallel sessions on one machine', () => {
  const scope = createUsageLifecyclePersistenceAroundExternalFlowsFixture();

  const addUsers = async (count: number, permissions: string[] = ['resources.update'], firstId = 10) => {
    const users = await scope.source
      .getRepository(User)
      .save(
        Array.from({ length: count }, (_, index) => ({ id: firstId + index, username: `user-${firstId + index}` })),
      );
    users.forEach((user) => Object.assign(user, { effectivePermissions: new Set(permissions) }));
    return users;
  };
  const setLimit = (maxParallelSessions: number, extra: Partial<Resource> = {}) =>
    scope.source.getRepository(Resource).update(1, { maxParallelSessions, ...extra });
  const count = async (table: string) => Number((await scope.source.query(`SELECT COUNT(*) AS c FROM ${table}`))[0].c);
  const rejectionsOf = (results: PromiseSettledResult<unknown>[]) =>
    results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));

  /**
   * Parks the next `runs` flow runs inside their flow. `entered` resolves once all of them are parked, so the
   * test observes their reservations deterministically instead of sleeping.
   */
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

  describe('starting', () => {
    it('lets N different people start and refuses the N+1th as full, even with takeover allowed', async () => {
      await setLimit(2, { allowTakeOver: true });
      const [third] = await addUsers(1);
      await scope.usage.startSession(1, scope.users[0], {});
      await scope.usage.startSession(1, scope.users[1], {});
      expect((await scope.usage.getActiveSessionsForResource(1)).map((session) => session.userId)).toEqual([1, 2]);
      await expect(scope.usage.startSession(1, third, { forceTakeOver: true })).rejects.toBeInstanceOf(
        ResourceFullError,
      );
      await expect(scope.usage.startSession(1, third, {})).rejects.toThrow('ResourceFullError');
      expect(scope.flow.runFlow).toHaveBeenCalledTimes(2);
      // The overview prefers the caller's own session even when somebody else started later.
      expect(await scope.usage.getActiveSessionOverview(1, 1)).toMatchObject({
        activeSessionCount: 2,
        maxParallelSessions: 2,
        isFull: true,
        usage: { userId: 1 },
      });
    });

    it('refuses a second session for the same person', async () => {
      await setLimit(3);
      await scope.usage.startSession(1, scope.users[0], {});
      await expect(scope.usage.startSession(1, scope.users[0], {})).rejects.toBeInstanceOf(
        AlreadyHasActiveSessionError,
      );
    });

    it('starts normally with forceTakeOver while a slot is free and leaves the running session untouched', async () => {
      await setLimit(3, { allowTakeOver: true });
      const first = await scope.usage.startSession(1, scope.users[0], {});
      await scope.usage.startSession(1, scope.users[1], { forceTakeOver: true });
      expect(scope.flow.runFlow.mock.calls.map((call) => call[1])).toEqual([
        ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
        ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
      ]);
      expect(await scope.source.getRepository(ResourceUsage).findOneByOrFail({ id: first.id })).toMatchObject({
        endTime: null,
        endNotes: null,
      });
      expect((await scope.usage.getActiveSessionsForResource(1)).map((session) => session.userId)).toEqual([1, 2]);
    });

    it('works with the production integrity migrations applied: different people may publish side by side', async () => {
      await scope.migrateIntegrity();
      await setLimit(2);
      await scope.usage.startSession(1, scope.users[0], {});
      await scope.usage.startSession(1, scope.users[1], {});
      expect(await scope.usage.getActiveSessionsForResource(1)).toHaveLength(2);
      await expect(scope.seedActiveSession()).rejects.toThrow(
        'User already has an active usage session on this resource',
      );
    });
  });

  describe('under concurrency', () => {
    it('never exceeds the limit or duplicates a person under simultaneous starts', async () => {
      await setLimit(3);
      const users = await addUsers(4);
      const results = await Promise.allSettled([
        ...users.map((user) => scope.usage.startSession(1, user, {})),
        scope.usage.startSession(1, users[0], {}),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(3);
      for (const reason of rejectionsOf(results)) {
        expect(reason instanceof ResourceFullError || reason instanceof AlreadyHasActiveSessionError).toBe(true);
      }
      const sessions = await scope.usage.getActiveSessionsForResource(1);
      expect(sessions).toHaveLength(3);
      expect(new Set(sessions.map((session) => session.userId)).size).toBe(3);
      expect(await scope.source.getRepository(ResourceUsage).countBy({ lifecyclePending: true })).toBe(0);
    });

    it('gives the same person one session under simultaneous starts with free slots', async () => {
      await setLimit(5);
      const results = await Promise.allSettled([1, 2, 3].map(() => scope.usage.startSession(1, scope.users[0], {})));
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const rejections = rejectionsOf(results);
      expect(rejections).toHaveLength(2);
      rejections.forEach((reason) => expect(reason).toBeInstanceOf(AlreadyHasActiveSessionError));
      expect(await scope.usage.getActiveSessionsForResource(1)).toHaveLength(1);
    });

    it('lets exactly one of several people start at limit 1 (the lifecycle is the only guard)', async () => {
      await setLimit(1, { allowTakeOver: false });
      const users = await addUsers(3);
      const results = await Promise.allSettled(
        [scope.users[0], ...users].map((user) => scope.usage.startSession(1, user, {})),
      );
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const rejections = rejectionsOf(results);
      expect(rejections).toHaveLength(3);
      for (const reason of rejections) {
        // Refused as busy while the winner is pending, or in use once it is published.
        expect(reason instanceof ResourceInUseError || reason instanceof ConflictException).toBe(true);
      }
      expect(await scope.usage.getActiveSessionsForResource(1)).toHaveLength(1);
      expect(await scope.source.getRepository(ResourceUsage).countBy({ lifecyclePending: true })).toBe(0);
    });

    it('does not refuse a start because another person start is in progress while a slot is free', async () => {
      await setLimit(2);
      const parked = parkFlows();
      const first = scope.usage.startSession(1, scope.users[0], {});
      await parked.entered;
      // The first start is parked inside its flow, holding a pending reservation.
      expect(await scope.source.getRepository(ResourceUsage).countBy({ lifecyclePending: true })).toBe(1);
      expect(await count('resource_usage_lifecycle_attempt')).toBe(1);
      await scope.usage.startSession(1, scope.users[1], {});
      parked.release();
      await first;
      expect(await scope.usage.getActiveSessionsForResource(1)).toHaveLength(2);
    });

    it('counts other people pending starts toward capacity', async () => {
      await setLimit(2);
      const [third] = await addUsers(1);
      const parked = parkFlows();
      const first = scope.usage.startSession(1, scope.users[0], {});
      await parked.entered;
      expect(await scope.source.getRepository(ResourceUsage).countBy({ lifecyclePending: true })).toBe(1);
      await scope.usage.startSession(1, scope.users[1], {});
      await expect(scope.usage.startSession(1, third, {})).rejects.toBeInstanceOf(ResourceFullError);
      parked.release();
      await first;
    });

    it('does not refuse a start while another person stop is in progress', async () => {
      await setLimit(2);
      await scope.usage.startSession(1, scope.users[0], {});
      const [third] = await addUsers(1);
      const parked = parkFlows();
      const stopping = scope.usage.endSession(1, scope.users[0], {});
      await parked.entered;
      expect(await scope.source.getRepository(ResourceUsageLifecycleAttempt).findOneByOrFail({})).toMatchObject({
        kind: 'end',
      });
      // The stopping session still holds its slot until the stop completes.
      await scope.usage.startSession(1, scope.users[1], {});
      await expect(scope.usage.startSession(1, third, {})).rejects.toBeInstanceOf(ResourceFullError);
      parked.release();
      await stopping;
      expect((await scope.usage.getActiveSessionsForResource(1)).map((session) => session.userId)).toEqual([2]);
    });

    it('refuses ending the same session twice at the same time', async () => {
      await setLimit(3);
      const own = await scope.usage.startSession(1, scope.users[0], {});
      await scope.usage.startSession(1, scope.users[1], {});
      const parked = parkFlows();
      const ending = scope.usage.endSession(1, scope.users[0], {});
      await parked.entered;
      await expect(scope.usage.endSession(1, scope.users[1], { usageId: own.id })).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(scope.usage.endSession(1, scope.users[0], {})).rejects.toThrow(
        'This session is already being ended',
      );
      parked.release();
      expect((await ending).id).toBe(own.id);
      expect((await scope.usage.getActiveSessionsForResource(1)).map((session) => session.userId)).toEqual([2]);
    });

    it('cleans up several interrupted lifecycles at once', async () => {
      await setLimit(3);
      const users = await addUsers(2);
      const parked = parkFlows(2);
      const starts = Promise.allSettled(users.map((user) => scope.usage.startSession(1, user, {})));
      await parked.entered;
      expect(await count('resource_usage_lifecycle_attempt')).toBe(2);
      expect(await scope.source.getRepository(ResourceUsage).countBy({ lifecyclePending: true })).toBe(2);
      await scope.usage.recoverInterruptedLifecycles();
      expect(await count('resource_usage_lifecycle_attempt')).toBe(0);
      expect(await scope.source.getRepository(ResourceUsage).countBy({ lifecyclePending: true })).toBe(0);
      // The parked flows resume after recovery; their starts fail because their reservations are gone.
      parked.release();
      expect((await starts).map((result) => result.status)).toEqual(['rejected', 'rejected']);
      expect(await scope.usage.getActiveSessionsForResource(1)).toEqual([]);
    });
  });

  describe('ending', () => {
    it('ends the callers own session without usageId and a chosen one with usageId', async () => {
      await setLimit(3);
      const [third] = await addUsers(1);
      const first = await scope.usage.startSession(1, scope.users[0], {});
      const second = await scope.usage.startSession(1, scope.users[1], {});
      await scope.usage.startSession(1, third, {});
      expect((await scope.usage.endSession(1, scope.users[0], {})).id).toBe(first.id);
      // users[0] has no session left: without a usageId nobody else's session is ended.
      await expect(scope.usage.endSession(1, scope.users[0], {})).rejects.toBeInstanceOf(NoOwnActiveSessionError);
      expect((await scope.usage.endSession(1, scope.users[0], { usageId: second.id })).id).toBe(second.id);
      expect(await scope.usage.getActiveSessionsForResource(1)).toHaveLength(1);
      // Even a single remaining session is not force-stopped without naming it on a shared machine.
      await expect(scope.usage.endSession(1, scope.users[0], {})).rejects.toBeInstanceOf(NoOwnActiveSessionError);
      expect((await scope.usage.getActiveSessionsForResource(1)).map((session) => session.userId)).toEqual([third.id]);
    });

    it('keeps the limit-1 force stop of the only session without usageId', async () => {
      const session = await scope.usage.startSession(1, scope.users[0], {});
      const ended = await scope.usage.endSession(1, scope.users[1], {});
      expect(ended).toMatchObject({ id: session.id, userId: 1 });
      expect(ended.endNotes).toContain('[By #2 - next-user]');
      await expect(scope.usage.endSession(1, scope.users[1], {})).rejects.toThrow('No active session found');
    });

    it('asks to choose a session when the limit was lowered to 1 with several sessions running', async () => {
      await setLimit(2);
      await scope.usage.startSession(1, scope.users[0], {});
      await scope.usage.startSession(1, scope.users[1], {});
      await setLimit(1);
      const [manager] = await addUsers(1);
      await expect(scope.usage.endSession(1, manager, {})).rejects.toBeInstanceOf(NoOwnActiveSessionError);
      expect(await scope.usage.getActiveSessionsForResource(1)).toHaveLength(2);
    });

    it('forbids ending somebody else session without resources.update, maintenance rights or supervision', async () => {
      await setLimit(3);
      const target = await scope.usage.startSession(1, scope.users[0], {});
      const [stranger] = await addUsers(1, []);
      await expect(scope.usage.endSession(1, stranger, { usageId: target.id })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(scope.introducers.canMaintain).toHaveBeenCalledWith(1, stranger.id, true);
      expect(await scope.source.getRepository(ResourceUsage).findOneByOrFail({ id: target.id })).toMatchObject({
        endTime: null,
      });
      expect(await count('resource_usage_lifecycle_attempt')).toBe(0);
      // Maintainers may end it.
      scope.introducers.canMaintain.mockResolvedValueOnce(true);
      expect((await scope.usage.endSession(1, stranger, { usageId: target.id })).id).toBe(target.id);
    });

    it('lets the supervisor end a supervised session by usageId', async () => {
      await setLimit(3, { supervisionMode: SupervisionMode.SUPERVISION_ALLOWED });
      const [supervisor, supervisee] = await addUsers(2, []);
      scope.introducers.isIntroducer.mockResolvedValue(true);
      await scope.usage.startSession(1, scope.users[0], {});
      const supervised = await scope.usage.startSession(1, supervisee, {}, { supervisorUserId: supervisor.id });
      const ended = await scope.usage.endSession(1, supervisor, { usageId: supervised.id });
      expect(ended).toMatchObject({ id: supervised.id, userId: supervisee.id });
      expect(scope.introducers.canMaintain).not.toHaveBeenCalled();
      expect((await scope.usage.getActiveSessionsForResource(1)).map((session) => session.userId)).toEqual([1]);
    });

    it('rejects a usageId of another resource or of an ended session', async () => {
      await setLimit(3);
      await scope.source.getRepository(Resource).save({
        id: 2,
        name: 'Other machine',
        type: ResourceType.Machine,
        maxParallelSessions: 3,
        supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED,
      });
      const elsewhere = await scope.usage.startSession(2, scope.users[0], {});
      const ended = await scope.usage.startSession(1, scope.users[1], {});
      await scope.usage.endSession(1, scope.users[1], {});
      await scope.usage.startSession(1, scope.users[0], {});
      for (const usageId of [elsewhere.id, ended.id]) {
        await expect(scope.usage.endSession(1, scope.users[1], { usageId })).rejects.toBeInstanceOf(
          BadRequestException,
        );
      }
      expect(await scope.usage.getActiveSessionsForResource(2)).toHaveLength(1);
      expect(await scope.usage.getActiveSessionsForResource(1)).toHaveLength(1);
    });
  });

  describe('gates that only block new starts', () => {
    it('keeps sessions running when the limit is lowered and blocks starts until there is room', async () => {
      await setLimit(3);
      const [third] = await addUsers(1);
      await scope.usage.startSession(1, scope.users[0], {});
      await scope.usage.startSession(1, scope.users[1], {});
      await setLimit(1);
      expect(await scope.usage.getActiveSessionsForResource(1)).toHaveLength(2);
      await expect(scope.usage.startSession(1, third, {})).rejects.toBeInstanceOf(ResourceInUseError);
      await setLimit(2);
      await expect(scope.usage.startSession(1, third, {})).rejects.toBeInstanceOf(ResourceFullError);
      await scope.usage.endSession(1, scope.users[0], {});
      await scope.usage.startSession(1, third, {});
      expect(await scope.usage.getActiveSessionsForResource(1)).toHaveLength(2);
    });

    it('blocks only new starts while maintenance is active; running sessions stop normally', async () => {
      await setLimit(3);
      await scope.usage.startSession(1, scope.users[0], {});
      scope.maintenance.hasActiveMaintenance.mockResolvedValue(true);
      await expect(scope.usage.startSession(1, scope.users[1], {})).rejects.toBeInstanceOf(
        ResourceUsageImpossibleMaintenanceInProgressException,
      );
      await expect(scope.usage.endSession(1, scope.users[0], {})).resolves.toMatchObject({ userId: 1 });
    });

    it('blocks only new starts while the machine is unhealthy; running sessions stop normally', async () => {
      await setLimit(3);
      await scope.usage.startSession(1, scope.users[0], {});
      scope.health.isResourceUnhealthy.mockResolvedValue(true);
      await expect(scope.usage.startSession(1, scope.users[1], {})).rejects.toBeInstanceOf(ResourceUnhealthyException);
      expect(await scope.usage.getActiveSessionsForResource(1)).toHaveLength(1);
      await expect(scope.usage.endSession(1, scope.users[0], {})).resolves.toMatchObject({ userId: 1 });
    });
  });

  describe('supervision', () => {
    it('lets a supervisor run their own session next to supervised ones without taking a slot', async () => {
      await setLimit(2);
      const [supervisee, other] = await addUsers(2);
      jest.spyOn(scope.usage, 'validateSupervisedStart').mockResolvedValue(undefined);
      await scope.usage.startSession(1, supervisee, {}, { supervisorUserId: 1 });
      await scope.usage.startSession(1, other, {}, { supervisorUserId: 1 });
      await expect(scope.usage.startSession(1, scope.users[0], {})).rejects.toBeInstanceOf(ResourceFullError);
      await scope.usage.endSession(1, supervisee, {});
      await scope.usage.startSession(1, scope.users[0], {});
      const sessions = await scope.usage.getActiveSessionsForResource(1);
      expect(sessions.map((session) => [session.userId, session.supervisorUserId])).toEqual([
        [other.id, 1],
        [1, null],
      ]);
      expect(sessions.every((session) => session.usageAction === ResourceUsageAction.Usage)).toBe(true);
    });

    it('refuses a supervised start for a supervisee who already has a session', async () => {
      await setLimit(3, { supervisionMode: SupervisionMode.SUPERVISION_ALLOWED });
      const [supervisee] = await addUsers(1);
      scope.introducers.isIntroducer.mockResolvedValue(true);
      await scope.usage.startSession(1, supervisee, {});
      await expect(
        scope.usage.startSession(1, supervisee, {}, { supervisorUserId: scope.users[0].id }),
      ).rejects.toBeInstanceOf(AlreadyHasActiveSessionError);
      // The real supervisor validation ran (nothing mocked away) before the per-person check refused.
      expect(scope.introducers.isIntroducer).toHaveBeenCalledWith(1, scope.users[0].id, true, expect.anything());
      expect(await scope.usage.getActiveSessionsForResource(1)).toHaveLength(1);
    });
  });
});
