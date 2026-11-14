import { Resource, User } from '@attraccess/database-entities';
import { rm } from 'node:fs/promises';
import { closeResourceTransactionConnection } from '../../../database/run-serialized-transaction';
import { AlreadyHasActiveSessionError } from '../errors/already-has-active-session.error';
import { ResourceFullError } from '../errors/resource-full.error';
import { StartBlockedException } from '../pre-start/start-confirmation.errors';
import { usageInternals } from '../sessions/fixtures/compose.test-fixture';
import { resetTestFixture } from './fixtures/setup.test-fixture';
import { createUsageLifecyclePersistenceAroundExternalFlowsFixture } from './fixtures/state.test-fixture';

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

  it('does not call the hook on a machine limited to one session', async () => {
    await setLimit(1);
    const { runStartCapacity } = installHook(1);
    await scope.usage.startSession(1, scope.users[0], {});
    expect(runStartCapacity).not.toHaveBeenCalled();
  });
});
