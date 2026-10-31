import { Resource, ResourceUsage, ResourceUsageAction, User } from '@attraccess/database-entities';
import { rm } from 'node:fs/promises';
import { closeResourceTransactionConnection } from '../../../database/run-serialized-transaction';
import { AlreadyHasActiveSessionError } from '../errors/already-has-active-session.error';
import { ResourceFullError } from '../errors/resource-full.error';
import { ResourceInUseError } from '../errors/resource-in-use.error';
import { resetTestFixture } from './fixtures/setup.test-fixture';
import { createUsageLifecyclePersistenceAroundExternalFlowsFixture } from './fixtures/state.test-fixture';

jest.setTimeout(30_000);

describe('Parallel sessions on one machine', () => {
  const scope = createUsageLifecyclePersistenceAroundExternalFlowsFixture();

  const addUsers = async (count: number) => {
    const users = await scope.source
      .getRepository(User)
      .save(Array.from({ length: count }, (_, index) => ({ id: 10 + index, username: `user-${index}` })));
    users.forEach((user) => Object.assign(user, { effectivePermissions: new Set(['resources.update']) }));
    return users;
  };
  const setLimit = (maxParallelSessions: number, extra: Partial<Resource> = {}) =>
    scope.source.getRepository(Resource).update(1, { maxParallelSessions, ...extra });

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

  it('lets N different people start and refuses the N+1th as full, even with takeover allowed', async () => {
    await setLimit(2, { allowTakeOver: true });
    const [third] = await addUsers(1);
    await scope.usage.startSession(1, scope.users[0], {});
    await scope.usage.startSession(1, scope.users[1], {});
    expect((await scope.usage.getActiveSessionsForResource(1)).map((session) => session.userId)).toEqual([1, 2]);
    await expect(scope.usage.startSession(1, third, { forceTakeOver: true })).rejects.toBeInstanceOf(ResourceFullError);
    await expect(scope.usage.startSession(1, third, {})).rejects.toThrow('ResourceFullError');
    expect(scope.flow.runFlow).toHaveBeenCalledTimes(2);
    expect(await scope.usage.getActiveSessionOverview(1, 2)).toMatchObject({
      activeSessionCount: 2,
      maxParallelSessions: 2,
      isFull: true,
      usage: { userId: 2 },
    });
  });

  it('refuses a second session for the same person', async () => {
    await setLimit(3);
    await scope.usage.startSession(1, scope.users[0], {});
    await expect(scope.usage.startSession(1, scope.users[0], {})).rejects.toBeInstanceOf(AlreadyHasActiveSessionError);
  });

  it('never exceeds the limit or duplicates a person under simultaneous starts', async () => {
    await setLimit(3);
    const users = await addUsers(4);
    const results = await Promise.allSettled([
      ...users.map((user) => scope.usage.startSession(1, user, {})),
      scope.usage.startSession(1, users[0], {}),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(3);
    const sessions = await scope.usage.getActiveSessionsForResource(1);
    expect(sessions).toHaveLength(3);
    expect(new Set(sessions.map((session) => session.userId)).size).toBe(3);
    expect(await scope.source.getRepository(ResourceUsage).countBy({ lifecyclePending: true })).toBe(0);
  });

  it('does not refuse a start because another person start is in progress while a slot is free', async () => {
    await setLimit(2);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    scope.flow.runFlow.mockImplementationOnce(async () => gate);
    const first = scope.usage.startSession(1, scope.users[0], {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    // The first start is parked inside its flow, holding a pending reservation.
    await scope.usage.startSession(1, scope.users[1], {});
    release();
    await first;
    expect(await scope.usage.getActiveSessionsForResource(1)).toHaveLength(2);
  });

  it('counts other people pending starts toward capacity', async () => {
    await setLimit(2);
    const [third] = await addUsers(1);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    scope.flow.runFlow.mockImplementationOnce(async () => gate);
    const first = scope.usage.startSession(1, scope.users[0], {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    await scope.usage.startSession(1, scope.users[1], {});
    await expect(scope.usage.startSession(1, third, {})).rejects.toBeInstanceOf(ResourceFullError);
    release();
    await first;
  });

  it('ends the callers own session without usageId and a chosen one with usageId', async () => {
    await setLimit(3);
    const [third] = await addUsers(1);
    const first = await scope.usage.startSession(1, scope.users[0], {});
    const second = await scope.usage.startSession(1, scope.users[1], {});
    await scope.usage.startSession(1, third, {});
    expect((await scope.usage.endSession(1, scope.users[0], {})).id).toBe(first.id);
    // users[0] has no session left and two others run: a usageId is required.
    await expect(scope.usage.endSession(1, scope.users[0], {})).rejects.toThrow('specify the usageId');
    expect((await scope.usage.endSession(1, scope.users[0], { usageId: second.id })).id).toBe(second.id);
    expect(await scope.usage.getActiveSessionsForResource(1)).toHaveLength(1);
    // exactly one left: ending without usageId is the limit-1 style force stop.
    expect((await scope.usage.endSession(1, scope.users[0], {})).userId).toBe(third.id);
    await expect(scope.usage.endSession(1, scope.users[0], {})).rejects.toThrow('No active session found');
  });

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
    await setLimit(2);
    await scope.usage.startSession(1, third, {});
    expect(await scope.usage.getActiveSessionsForResource(1)).toHaveLength(2);
  });

  it('blocks only new starts while maintenance is active; running sessions stop normally', async () => {
    await setLimit(3);
    await scope.usage.startSession(1, scope.users[0], {});
    scope.maintenance.hasActiveMaintenance.mockResolvedValue(true);
    await expect(scope.usage.startSession(1, scope.users[1], {})).rejects.toThrow();
    await expect(scope.usage.endSession(1, scope.users[0], {})).resolves.toMatchObject({ userId: 1 });
  });

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

  it('cleans up several interrupted lifecycles at once', async () => {
    await setLimit(3);
    const users = await addUsers(2);
    scope.flow.runFlow.mockImplementation(async () => new Promise(() => undefined));
    void scope.usage.startSession(1, users[0], {}).catch(() => undefined);
    void scope.usage.startSession(1, users[1], {}).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await scope.source.query('SELECT COUNT(*) AS c FROM resource_usage_lifecycle_attempt')).toEqual([{ c: 2 }]);
    await scope.usage.recoverInterruptedLifecycles();
    expect(await scope.source.query('SELECT COUNT(*) AS c FROM resource_usage_lifecycle_attempt')).toEqual([{ c: 0 }]);
    expect(await scope.source.getRepository(ResourceUsage).countBy({ lifecyclePending: true })).toBe(0);
  });
});
