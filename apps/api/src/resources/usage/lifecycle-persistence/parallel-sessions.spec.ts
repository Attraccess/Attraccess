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
import { FlowExecutionError } from '../../flows/errors/flow-execution.error';
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

  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

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

    it('queues a start behind another person start in progress while a slot is free', async () => {
      await setLimit(2);
      const parked = parkFlows();
      const first = scope.usage.startSession(1, scope.users[0], {});
      await parked.entered;
      // The first start is parked inside its flow, holding a pending reservation.
      expect(await scope.source.getRepository(ResourceUsage).countBy({ lifecyclePending: true })).toBe(1);
      expect(await count('resource_usage_lifecycle_attempt')).toBe(1);
      const second = scope.usage.startSession(1, scope.users[1], {});
      await settle();
      expect(await count('resource_usage_lifecycle_attempt')).toBe(1);
      parked.release();
      await Promise.all([first, second]);
      expect(await scope.usage.getActiveSessionsForResource(1)).toHaveLength(2);
    });

    it('refuses a queued start as full once the earlier starts took the last slot', async () => {
      await setLimit(2);
      const [third] = await addUsers(1);
      const parked = parkFlows();
      const first = scope.usage.startSession(1, scope.users[0], {});
      await parked.entered;
      const second = scope.usage.startSession(1, scope.users[1], {});
      const queued = scope.usage.startSession(1, third, {});
      // Observe the refusal right away: it can settle while the earlier starts are still finishing.
      const refused = expect(queued).rejects.toBeInstanceOf(ResourceFullError);
      parked.release();
      await Promise.all([first, second]);
      await refused;
    });

    it('queues a start behind another person stop in progress', async () => {
      await setLimit(2);
      await scope.usage.startSession(1, scope.users[0], {});
      const parked = parkFlows();
      const stopping = scope.usage.endSession(1, scope.users[0], {});
      await parked.entered;
      expect(await scope.source.getRepository(ResourceUsageLifecycleAttempt).findOneByOrFail({})).toMatchObject({
        kind: 'end',
      });
      const starting = scope.usage.startSession(1, scope.users[1], {});
      await settle();
      expect(await count('resource_usage_lifecycle_attempt')).toBe(1);
      parked.release();
      await Promise.all([stopping, starting]);
      expect((await scope.usage.getActiveSessionsForResource(1)).map((session) => session.userId)).toEqual([2]);
    });

    it('ends the same session only once when two stops run at the same time', async () => {
      await setLimit(3);
      const own = await scope.usage.startSession(1, scope.users[0], {});
      await scope.usage.startSession(1, scope.users[1], {});
      const parked = parkFlows();
      const ending = scope.usage.endSession(1, scope.users[0], {});
      await parked.entered;
      const second = scope.usage.endSession(1, scope.users[1], { usageId: own.id });
      const refused = expect(second).rejects.toBeInstanceOf(BadRequestException);
      parked.release();
      expect((await ending).id).toBe(own.id);
      await refused;
      expect((await scope.usage.getActiveSessionsForResource(1)).map((session) => session.userId)).toEqual([2]);
    });

    it('cleans up an interrupted lifecycle and lets the queued one go on', async () => {
      await setLimit(3);
      const users = await addUsers(2);
      const parked = parkFlows();
      const starts = Promise.allSettled(users.map((user) => scope.usage.startSession(1, user, {})));
      await parked.entered;
      expect(await count('resource_usage_lifecycle_attempt')).toBe(1);
      expect(await scope.source.getRepository(ResourceUsage).countBy({ lifecyclePending: true })).toBe(1);
      await scope.usage.recoverInterruptedLifecycles();
      expect(await count('resource_usage_lifecycle_attempt')).toBe(0);
      expect(await scope.source.getRepository(ResourceUsage).countBy({ lifecyclePending: true })).toBe(0);
      // The parked flow resumes after recovery and fails because its reservation is gone; the queued start is unharmed.
      parked.release();
      expect((await starts).map((result) => result.status)).toEqual(['rejected', 'fulfilled']);
      expect((await scope.usage.getActiveSessionsForResource(1)).map((session) => session.userId)).toEqual([
        users[1].id,
      ]);
    });
  });

  describe('active session counts for flows', () => {
    const payloadOf = (trigger: ResourceFlowNodeType, index = 0) =>
      scope.flow.runFlow.mock.calls.filter((call) => call[1] === trigger)[index][2] as {
        activeSessions: { before: number; after: number; limit: number };
      };

    it('reports before, after and limit around starts and stops', async () => {
      await setLimit(3);
      await scope.usage.startSession(1, scope.users[0], {});
      await scope.usage.startSession(1, scope.users[1], {});
      await scope.usage.endSession(1, scope.users[0], {});
      await scope.usage.endSession(1, scope.users[1], {});
      expect(payloadOf(ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, 0).activeSessions).toEqual({
        before: 0,
        after: 1,
        limit: 3,
      });
      expect(payloadOf(ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, 1).activeSessions).toEqual({
        before: 1,
        after: 2,
        limit: 3,
      });
      expect(payloadOf(ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED, 0).activeSessions).toEqual({
        before: 2,
        after: 1,
        limit: 3,
      });
      expect(payloadOf(ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED, 1).activeSessions).toEqual({
        before: 1,
        after: 0,
        limit: 3,
      });
    });

    it('reports exactly one first start and one last stop for simultaneous starts and stops', async () => {
      await setLimit(3);
      const users = await addUsers(2);
      await Promise.all(users.map((user) => scope.usage.startSession(1, user, {})));
      await Promise.all(users.map((user) => scope.usage.endSession(1, user, {})));
      const starts = [0, 1].map((index) => payloadOf(ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, index));
      const stops = [0, 1].map((index) => payloadOf(ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED, index));
      expect(starts.filter(({ activeSessions }) => activeSessions.before === 0)).toHaveLength(1);
      expect(stops.filter(({ activeSessions }) => activeSessions.after === 0)).toHaveLength(1);
    });

    it('does not skew the next count after an aborted start or stop', async () => {
      await setLimit(3);
      scope.flow.runFlow.mockRejectedValueOnce(new FlowExecutionError('boom'));
      await scope.usage.startSession(1, scope.users[0], {}).catch(() => undefined);
      const aborted = await Promise.allSettled([scope.usage.startSession(1, scope.users[0], {})]);
      expect(aborted[0].status).toBe('fulfilled');
      expect(
        scope.flow.runFlow.mock.calls.map((call) => (call[2] as { activeSessions: { before: number } }).activeSessions),
      ).toEqual([
        { before: 0, after: 1, limit: 3 },
        { before: 0, after: 1, limit: 3 },
      ]);
    });

    it('reports a takeover as 1 to 1 and keeps limit 1 working as before', async () => {
      await setLimit(1, { allowTakeOver: true });
      await scope.usage.startSession(1, scope.users[0], {});
      await scope.usage.startSession(1, scope.users[1], { forceTakeOver: true });
      expect(payloadOf(ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER).activeSessions).toEqual({
        before: 1,
        after: 1,
        limit: 1,
      });
    });

    it('reports after 0 for the stop that follows a start flow cancelling its own session', async () => {
      await setLimit(2);
      const users = await addUsers(1);
      scope.flow.runFlow.mockImplementationOnce(async (resourceId, _type, _payload, _manager, options) => {
        await scope.usage.endLifecycleCandidate(options?.lifecycleAttemptId as string, resourceId as number, 'cancel');
        throw new FlowExecutionError('cancelled');
      });
      await scope.usage.startSession(1, users[0], {}).catch(() => undefined);
      expect(payloadOf(ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED).activeSessions).toEqual({
        before: 1,
        after: 0,
        limit: 2,
      });
    });
  });

  describe('ending sessions from flows', () => {
    it('ends all sessions, each with its own stop and only the last reporting none left', async () => {
      await setLimit(3);
      const users = await addUsers(2);
      await Promise.all(users.map((user) => scope.usage.startSession(1, user, {})));
      scope.flow.runFlow.mockClear();
      await scope.usage.endSessionsOfTarget(1, { kind: 'all' }, 'flow');
      const afters = scope.flow.runFlow.mock.calls.map(
        (call) => (call[2] as { activeSessions: { after: number } }).activeSessions.after,
      );
      expect(afters).toEqual([1, 0]);
      expect(await scope.usage.getActiveSessionsForResource(1)).toEqual([]);
    });

    it('does nothing for all without sessions and fails for a user without one', async () => {
      await setLimit(3);
      await expect(scope.usage.endSessionsOfTarget(1, { kind: 'all' }, '')).resolves.toBeUndefined();
      await expect(scope.usage.endSessionsOfTarget(1, { kind: 'user', userId: 1 }, '')).rejects.toThrow();
    });

    it('ends one user session and skips sessions that are already being ended', async () => {
      await setLimit(3);
      await scope.usage.startSession(1, scope.users[0], {});
      await scope.usage.startSession(1, scope.users[1], {});
      const parked = parkFlows();
      const ending = scope.usage.endSession(1, scope.users[0], {});
      await parked.entered;
      scope.flow.runFlow.mockClear();
      const endingAll = scope.usage.endSessionsOfTarget(1, { kind: 'all' }, '');
      parked.release();
      await Promise.all([ending, endingAll]);
      // The session that was already ending is not ended a second time.
      expect(scope.flow.runFlow).toHaveBeenCalledTimes(1);
      expect(await scope.usage.getActiveSessionsForResource(1)).toEqual([]);
    });

    it('lets two simultaneous ends of all sessions both succeed and end every session once', async () => {
      await setLimit(3);
      const users = await addUsers(2);
      await Promise.all(users.map((user) => scope.usage.startSession(1, user, {})));
      scope.flow.runFlow.mockClear();
      await expect(
        Promise.all([
          scope.usage.endSessionsOfTarget(1, { kind: 'all' }, ''),
          scope.usage.endSessionsOfTarget(1, { kind: 'all' }, ''),
        ]),
      ).resolves.toBeDefined();
      expect(scope.flow.runFlow).toHaveBeenCalledTimes(2);
      expect(await scope.usage.getActiveSessionsForResource(1)).toEqual([]);
    });

    it('runs ends requested inside a start flow after that start finished, without deadlock', async () => {
      await setLimit(3);
      const [other] = await addUsers(1);
      await scope.usage.startSession(1, other, {});
      scope.flow.runFlow.mockImplementationOnce(async (resourceId, _type, _payload, _manager, options) => {
        await scope.usage.deferSessionEnds(
          options?.lifecycleAttemptId as string,
          resourceId as number,
          { kind: 'user', userId: other.id },
          'flow',
        );
      });
      await scope.usage.startSession(1, scope.users[0], {});
      expect((await scope.usage.getActiveSessionsForResource(1)).map((session) => session.userId)).toEqual([1]);
    });

    it('drops deferred ends when the start fails', async () => {
      await setLimit(3);
      const [other] = await addUsers(1);
      await scope.usage.startSession(1, other, {});
      scope.flow.runFlow.mockImplementationOnce(async (resourceId, _type, _payload, _manager, options) => {
        await scope.usage.deferSessionEnds(
          options?.lifecycleAttemptId as string,
          resourceId as number,
          { kind: 'all' },
          'flow',
        );
        throw new FlowExecutionError('boom');
      });
      await scope.usage.startSession(1, scope.users[0], {}).catch(() => undefined);
      expect(await scope.usage.getActiveSessionsForResource(1)).toHaveLength(1);
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
