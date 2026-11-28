import { Project, Resource, ResourceUsage } from '@attraccess/database-entities';
import { ResourceFlowNodeType } from '@attraccess/application-models';
import {
  closeLifecycleFixture,
  resetTestFixture,
} from '../../../database/adapters/usage/lifecycle-fixtures/setup.test-fixture';
import { createUsageLifecyclePersistenceAroundExternalFlowsFixture } from '../../../database/adapters/usage/lifecycle-fixtures/state.test-fixture';
import { SessionExtensionNotPossibleException } from '../session-duration/session-duration.errors';
import { usageInternals } from '../sessions/fixtures/compose.test-fixture';

jest.setTimeout(60_000);

/** ATT-1421: a session can be extended while its project is being switched; the continuation keeps the new end. */
describe('Extending a session whose project is being switched', () => {
  const scope = createUsageLifecyclePersistenceAroundExternalFlowsFixture();

  const usages = () => scope.source.getRepository(ResourceUsage).find({ order: { id: 'ASC' } });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 400));
  const extendedBy = (autoEndAt: Date | null | undefined, minutes: number) =>
    new Date((autoEndAt as Date).getTime() + minutes * 60_000);

  const gate = () => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let enter!: () => void;
    const entered = new Promise<void>((resolve) => (enter = resolve));
    const pass = () => {
      enter();
      return released;
    };
    return { entered, release, pass };
  };

  const parkSwitchFlow = () => {
    const parked = gate();
    scope.flow.runFlow.mockImplementation(async (_resourceId, type: ResourceFlowNodeType) => {
      if (type === ResourceFlowNodeType.INPUT_RESOURCE_USAGE_PROJECT_SWITCHED) await parked.pass();
    });
    return parked;
  };

  /** Holds the transaction that records `action` open, with every row it locked or changed until then. */
  const parkTransactionAt = (action: string) => {
    const parked = gate();
    const { audit } = usageInternals(scope.usage).extensions as unknown as { audit: { record: jest.Mock } };
    audit.record.mockImplementation(async (event: { action: string }) => {
      if (event.action === action) await parked.pass();
    });
    return parked;
  };

  const track = <T>(running: Promise<T>) => {
    const state: { done: boolean } = { done: false };
    const finished = running.finally(() => (state.done = true));
    finished.catch(() => undefined);
    return { state, finished };
  };

  const arrange = async (limit: number) => {
    await scope.source
      .getRepository(Resource)
      .update(1, { maxParallelSessions: limit, maxSessionDurationMinutes: 480, requireSessionDurationEstimate: true });
    const own = await scope.usage.startSession(1, scope.users[0], { projectId: 1, estimatedDurationMinutes: 60 });
    if (limit > 1) await scope.usage.startSession(1, scope.users[1], { estimatedDurationMinutes: 60 });
    return own;
  };
  const switchOwn = (usageId: number) => scope.usage.switchSessionProject(1, scope.users[0], { projectId: 2, usageId });
  const extend = (usageId: number | undefined) =>
    scope.usage.extendSession(1, scope.users[0], { extendByMinutes: 60, ...(usageId ? { usageId } : {}) });

  beforeEach(async () => {
    await resetTestFixture(scope);
    await scope.source.getRepository(Project).save([
      { id: 1, name: 'Old project', owner: scope.users[0] },
      { id: 2, name: 'New project', owner: scope.users[0] },
    ]);
  });

  afterEach(async () => {
    await closeLifecycleFixture(scope);
    jest.restoreAllMocks();
  });

  const cases = [1, 2].flatMap((limit) => [true, false].map((named) => [limit, named] as const));

  it.each(cases)(
    'limit %i, session named: %s: succeeds while the switch flow runs, and the continuation keeps the new end',
    async (limit, named) => {
      const own = await arrange(limit);
      const parked = parkSwitchFlow();
      const switching = switchOwn(own.id);
      await parked.entered;

      const extension = track(extend(named ? own.id : undefined));
      await settle();
      parked.release();
      const continuation = await switching;
      await extension.finished;

      const expected = extendedBy(own.autoEndAt, 60);
      expect((await usages()).find((usage) => usage.id === continuation.id)?.autoEndAt).toEqual(expected);
    },
  );

  it('hands an extension that has not committed yet to the continuation: the switch waits for its row lock', async () => {
    const own = await arrange(1);
    const flow = parkSwitchFlow();
    const switching = track(switchOwn(own.id));
    await flow.entered;
    const extensionOpen = parkTransactionAt('usage_session.extended');
    const extension = extend(own.id);
    await extensionOpen.entered;

    flow.release();
    await settle();
    expect(switching.state.done).toBe(false);
    extensionOpen.release();

    await extension;
    const continuation = await switching.finished;
    expect(continuation.autoEndAt).toEqual(extendedBy(own.autoEndAt, 60));
  });

  it.each([true, false])(
    'session named: %s: extends the continuation when the switch commits while the extension waits for the row',
    async (named) => {
      const own = await arrange(1);
      const commit = parkTransactionAt('usage_session.project_switched');
      const switching = switchOwn(own.id);
      await commit.entered;

      const extension = track(extend(named ? own.id : undefined));
      await settle();
      expect(extension.state.done).toBe(false);
      commit.release();

      const continuation = await switching;
      expect((await extension.finished).id).toBe(continuation.id);
      expect((await usages()).find((usage) => usage.id === continuation.id)?.autoEndAt).toEqual(
        extendedBy(own.autoEndAt, 60),
      );
    },
  );

  it.each([true, false])(
    'session named: %s: another person’s extension waits for a switch that outlasts the wait for a shared machine',
    async (named) => {
      const own = await arrange(2);
      const others = (await usages()).find((usage) => usage.id !== own.id) as ResourceUsage;
      Object.assign(usageInternals(scope.usage).turns, { sessionChangeWaitMs: 100 });
      const parked = parkSwitchFlow();
      const switching = switchOwn(own.id);
      await parked.entered;

      const extension = track(
        scope.usage.extendSession(1, scope.users[1], {
          extendByMinutes: 60,
          ...(named ? { usageId: others.id } : {}),
        }),
      );
      await settle();
      expect(extension.state.done).toBe(false);
      parked.release();
      await switching;

      expect(await extension.finished).toMatchObject({ id: others.id, autoEndAt: extendedBy(others.autoEndAt, 60) });
    },
  );

  it('keeps the old end when the switch is rolled back after the extension, which stays', async () => {
    const own = await arrange(1);
    const parked = gate();
    scope.flow.runFlow.mockImplementation(() => parked.pass());
    scope.billing.handleResourceUsageContinuation.mockRejectedValueOnce(new Error('commit failed'));
    const switching = expect(switchOwn(own.id)).rejects.toThrow('commit failed');
    await parked.entered;

    await extend(own.id);
    parked.release();
    await switching;

    expect(await usages()).toEqual([
      expect.objectContaining({ id: own.id, endTime: null, autoEndAt: extendedBy(own.autoEndAt, 60) }),
    ]);
  });

  it('still refuses to extend a session that is being stopped', async () => {
    const own = await arrange(1);
    const parked = gate();
    scope.flow.runFlow.mockImplementation(() => parked.pass());
    const stopping = scope.usage.endSession(1, scope.users[0], {});
    await parked.entered;

    await expect(extend(own.id)).rejects.toBeInstanceOf(SessionExtensionNotPossibleException);

    parked.release();
    await stopping;
  });
});
