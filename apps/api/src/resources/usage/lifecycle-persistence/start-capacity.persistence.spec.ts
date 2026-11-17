import { Resource, ResourceUsage, ResourceUsageLifecycleAttempt, User } from '@attraccess/database-entities';
import { ResourceUsageAction } from '@attraccess/application-models';
import type { StartCapacityContext, StartCapacityHook } from '@attraccess/plugins-backend-sdk';
import { ConflictException } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import { closeResourceTransactionConnection } from '../../../database/sqlite/run-serialized-transaction';
import { unitOfWorkFor } from '../../../database/adapters/shared-unit-of-work';
import { createSqlitePluginPersistence, sqlitePersistence } from '@attraccess/plugins-backend-sdk/sqlite';
import { ReaderUiHooksService } from '../../../plugin-system/reader-ui/reader-ui-hooks.service';
import { AlreadyHasActiveSessionError } from '../errors/already-has-active-session.error';
import { ResourceFullError } from '../errors/resource-full.error';
import { StartBlockedException } from '../pre-start/start-confirmation.errors';
import { countOccupiedSlots, findOccupyingUserIds } from '../../../database/adapters/usage/active-usage-queries';
import { usageInternals } from '../sessions/fixtures/compose.test-fixture';
import { resetTestFixture } from '../../../database/adapters/usage/lifecycle-fixtures/setup.test-fixture';
import { createUsageLifecyclePersistenceAroundExternalFlowsFixture } from '../../../database/adapters/usage/lifecycle-fixtures/state.test-fixture';

jest.setTimeout(30_000);

/** The plugins' atomic capacity hook runs inside the serialized start transaction (ATT-1197). */
describe('Start capacity hook', () => {
  const scope = createUsageLifecyclePersistenceAroundExternalFlowsFixture();
  const reason = { code: 'RESERVED', title: 'Reserved', body: 'Held for a booking' };

  const addUsers = async (count: number, firstId = 10) => {
    const users = await scope.source
      .getRepository(User)
      .save(
        Array.from({ length: count }, (_, index) => ({ id: firstId + index, username: `user-${firstId + index}` })),
      );
    users.forEach((user) => Object.assign(user, { effectivePermissions: new Set(['resources.update']) }));
    return users;
  };
  const setLimit = (maxParallelSessions: number) =>
    scope.source.getRepository(Resource).update(1, { maxParallelSessions });

  /** Installs a fake plugin hook service; `held` is how many slots it holds back. */
  const installHook = (held: number) => {
    const flush = jest.fn().mockResolvedValue(undefined);
    const runStartCapacity = jest
      .fn()
      .mockImplementation(async (run: { occupiedSlots: number; sessionLimit: number }) => ({
        refusal: run.occupiedSlots + held >= run.sessionLimit ? { plugin: 'reservations', reason } : null,
        flush,
      }));
    Object.assign(usageInternals(scope.usage).preparation, {
      pluginHooks: { hasStartCapacityHooks: () => true, runStartCapacity },
    });
    return { runStartCapacity, flush };
  };

  /** Installs the real hook service with one plugin hook, as the plugin system would register it. */
  const installPluginHook = (hook: StartCapacityHook) => {
    const service = new ReaderUiHooksService(
      { startCapacityHooks: () => [{ plugin: 'reservations', hook }] } as never,
      { failurePolicy: jest.fn().mockResolvedValue('fail-closed') } as never,
      { onCleared: jest.fn(), raise: jest.fn(), clearWhere: jest.fn() } as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      { get: () => ({}) } as never,
      unitOfWorkFor(scope.source),
    );
    Object.assign(usageInternals(scope.usage).preparation, { pluginHooks: service });
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

  it('refuses a start that would take a held slot, with the plugin reason', async () => {
    await setLimit(2);
    const { runStartCapacity, flush } = installHook(1);
    await scope.usage.startSession(1, scope.users[0], {});
    // 1 occupied + 1 held reaches the limit of 2
    const error = await scope.usage.startSession(1, scope.users[1], {}).catch((e) => e);
    expect(error).toBeInstanceOf(StartBlockedException);
    expect((error as StartBlockedException).getResponse()).toMatchObject({ code: 'START_BLOCKED', reason });
    expect(runStartCapacity).toHaveBeenLastCalledWith(
      expect.objectContaining({ resourceId: 1, userId: scope.users[1].id, sessionLimit: 2, occupiedSlots: 1 }),
    );
    expect(flush).toHaveBeenCalled();
    expect(await scope.usage.getActiveSessionsForResource(1)).toHaveLength(1);
  });

  it('never lets simultaneous starts take a held slot', async () => {
    await setLimit(3);
    installHook(1);
    const users = await addUsers(4);
    const results = await Promise.allSettled(users.map((user) => scope.usage.startSession(1, user, {})));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    for (const result of results) {
      if (result.status === 'rejected') {
        expect(result.reason instanceof StartBlockedException || result.reason instanceof ResourceFullError).toBe(true);
      }
    }
    expect(await scope.usage.getActiveSessionsForResource(1)).toHaveLength(2);
  });

  it('lets the precheck see a shared machine with a running session as startable, and a full one as full', async () => {
    await setLimit(2);
    await scope.usage.startSession(1, scope.users[0], {});
    await expect(scope.usage.precheckStart(1, scope.users[1], {})).resolves.toBeUndefined();
    await expect(scope.usage.precheckStart(1, scope.users[0], {})).rejects.toBeInstanceOf(AlreadyHasActiveSessionError);
    await scope.usage.startSession(1, scope.users[1], {});
    const [third] = await addUsers(1);
    await expect(scope.usage.precheckStart(1, third, {})).rejects.toBeInstanceOf(ResourceFullError);
  });

  it('hands the hook the users behind the occupied slots: published sessions and pending starts only', async () => {
    await setLimit(5);
    const [finalized, pending, ended, doorUser, supervisor, starter] = await addUsers(6);
    const usages = scope.source.getRepository(ResourceUsage);
    await usages.save([
      // A supervised session: the supervisor never takes a slot of their own.
      {
        resourceId: 1,
        userId: finalized.id,
        supervisorUserId: supervisor.id,
        startTime: new Date(),
        isFinalized: true,
      },
      { resourceId: 1, userId: pending.id, startTime: new Date(), isFinalized: false, lifecyclePending: true },
      { resourceId: 1, userId: ended.id, startTime: new Date(), endTime: new Date(), isFinalized: true },
      {
        resourceId: 1,
        userId: doorUser.id,
        usageAction: ResourceUsageAction.DoorLock,
        startTime: new Date(),
        isFinalized: true,
      },
    ]);
    const occupying = await findOccupyingUserIds(scope.source.manager, 1);
    expect([...occupying].sort()).toEqual([finalized.id, pending.id]);
    expect(await countOccupiedSlots(scope.source.manager, 1)).toBe(occupying.length);

    const { runStartCapacity } = installHook(3); // 2 occupied + 3 held fill the 5 slots
    await expect(scope.usage.startSession(1, starter, {})).rejects.toBeInstanceOf(StartBlockedException);
    const [run] = runStartCapacity.mock.calls[0] as [{ occupiedSlots: number; usersInSession: number[] }];
    expect(run.occupiedSlots).toBe(2);
    expect([...run.usersInSession].sort()).toEqual([finalized.id, pending.id]);
  });

  it('asks the hook about a start, not a takeover, when forceTakeOver is set on a shared machine', async () => {
    await setLimit(2);
    const { runStartCapacity } = installHook(0);
    await scope.usage.startSession(1, scope.users[0], {});
    await scope.usage.startSession(1, scope.users[1], { forceTakeOver: true });
    expect(runStartCapacity).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'start', occupiedSlots: 1 }));
    expect(await scope.usage.getActiveSessionsForResource(1)).toHaveLength(2);
  });

  it('gives the plugin hook its confirmed step keys, the origin and the open start transaction', async () => {
    await setLimit(2);
    const seen: Array<Pick<StartCapacityContext, 'confirmedStepKeys' | 'origin' | 'usersInSession'> & object> = [];
    let inTransaction: boolean | undefined;
    let ownSessionsSeen = -1;
    installPluginHook(async (ctx) => {
      seen.push({ confirmedStepKeys: ctx.confirmedStepKeys, origin: ctx.origin, usersInSession: ctx.usersInSession });
      const manager = managerOfHostScope(ctx.scope);
      inTransaction = manager.queryRunner?.isTransactionActive;
      ownSessionsSeen = await manager.count(ResourceUsage, { where: { resourceId: 1 } });
      return { heldSlots: 0 };
    });
    await scope.usage.startSession(1, scope.users[0], {});
    await scope.usage.startSession(
      1,
      scope.users[1],
      {},
      { confirmedStepKeys: { reservations: ['override-4'], other: ['x'] }, origin: 'reader', language: 'en' },
    );
    expect(seen).toEqual([
      { confirmedStepKeys: [], origin: 'web', usersInSession: [] },
      { confirmedStepKeys: ['override-4'], origin: 'reader', usersInSession: [scope.users[0].id] },
    ]);
    expect(inTransaction).toBe(true);
    expect(ownSessionsSeen).toBe(1);
    expect(await scope.usage.getActiveSessionsForResource(1)).toHaveLength(2);
  });

  it("lets the precheck pass on a shared machine while another user's start is in progress", async () => {
    const candidate = await scope.source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: scope.users[0].id,
      startTime: new Date(),
      isFinalized: false,
      lifecyclePending: true,
    });
    await scope.source.getRepository(ResourceUsageLifecycleAttempt).save({
      id: 'start-in-progress',
      resourceId: 1,
      kind: 'start',
      previousUsageId: null,
      candidateUsageId: candidate.id,
      transitionTime: candidate.startTime,
      formSubmissions: [],
      billingItems: [],
    });
    // Limited to one session, a start in progress blocks the machine as before.
    await expect(scope.usage.precheckStart(1, scope.users[1], {})).rejects.toBeInstanceOf(ConflictException);
    await setLimit(2);
    await expect(scope.usage.precheckStart(1, scope.users[1], {})).resolves.toBeUndefined();
  });

  it('does not call the hook on a machine limited to one session', async () => {
    await setLimit(1);
    const { runStartCapacity } = installHook(1);
    await scope.usage.startSession(1, scope.users[0], {});
    expect(runStartCapacity).not.toHaveBeenCalled();
  });
});

/** What an SQLite plugin does with the scope of a capacity hook. */
function managerOfHostScope(hostScope: StartCapacityContext['scope']) {
  const persistence = createSqlitePluginPersistence({
    pluginName: 'reservations',
    connection: () => {
      throw new Error('unused');
    },
  });
  return sqlitePersistence({ persistence }).managerOf(hostScope);
}
