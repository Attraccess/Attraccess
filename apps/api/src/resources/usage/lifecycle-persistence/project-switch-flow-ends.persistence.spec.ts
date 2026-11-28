import { Project, Resource, ResourceUsage, ResourceUsageLifecycleAttempt } from '@attraccess/database-entities';
import { type FlowNodeRecord, ResourceFlowNodeType, ResourceType } from '@attraccess/application-models';
import {
  closeLifecycleFixture,
  resetTestFixture,
} from '../../../database/adapters/usage/lifecycle-fixtures/setup.test-fixture';
import { createUsageLifecyclePersistenceAroundExternalFlowsFixture } from '../../../database/adapters/usage/lifecycle-fixtures/state.test-fixture';
import { FlowExecutionError } from '../../flows/errors/flow-execution.error';
import { EndUsageSessionExecutor } from '../../flows/node-executors/end-usage-session.executor';
import type { NodeExecutionContext } from '../../flows/node-executors/node-executor.interface';
import { MachineBusyError } from '../errors/machine-busy.error';
import type { ResourceUsageService } from '../sessions/resource-usage.service';
import { forkUsageInstance, usageInternals } from '../sessions/fixtures/compose.test-fixture';
import { FakeValkey } from '../sessions/fake-valkey.test-fixture';
import { ValkeySessionChangeCoordination } from '../sessions/session-change-coordination';

jest.setTimeout(60_000);

/**
 * ATT-1421: an "End usage session" of another flow run (emergency stop, idle shutdown, a button, MQTT) that arrives
 * while a project switch is pending must not get lost: it ends the continuation when the switch commits, and the old
 * part when the switch is rolled back.
 */
describe('Ends asked by other flow runs while a project switch is pending', () => {
  const scope = createUsageLifecyclePersistenceAroundExternalFlowsFixture();

  const usages = () => scope.source.getRepository(ResourceUsage).find({ order: { id: 'ASC' } });
  const attempts = () => scope.source.getRepository(ResourceUsageLifecycleAttempt).count();
  const openUserIds = async () => (await usages()).filter((usage) => !usage.endTime).map((usage) => usage.userId);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

  /** Parks the switch flow; `release` lets it succeed, or fail when given an error. */
  const parkSwitchFlow = () => {
    let release!: (error?: Error) => void;
    const released = new Promise<Error | undefined>((resolve) => (release = resolve));
    let enter!: () => void;
    const entered = new Promise<void>((resolve) => (enter = resolve));
    scope.flow.runFlow.mockImplementation(async (_resourceId, type: ResourceFlowNodeType) => {
      if (type !== ResourceFlowNodeType.INPUT_RESOURCE_USAGE_PROJECT_SWITCHED) return;
      enter();
      const error = await released;
      if (error) throw error;
    });
    return { entered, release };
  };

  /** The owner's session (in project 1) on a machine with room for `limit`, with a second user on a shared one. */
  const arrange = async (limit: number) => {
    await scope.source.getRepository(Resource).update(1, { maxParallelSessions: limit });
    const own = await scope.usage.startSession(1, scope.users[0], { projectId: 1 });
    if (limit > 1) await scope.usage.startSession(1, scope.users[1], {});
    return own;
  };

  /** The flow node as another flow run executes it: no lifecycle attempt of its own. */
  const pressEnd = (
    service: ResourceUsageService,
    target: 'all' | 'user' | 'triggering',
    payload: object = {},
  ): Promise<unknown> =>
    new EndUsageSessionExecutor(service).execute(
      {
        id: 'end',
        type: ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION,
        resourceId: 1,
        data: { target, notes: 'emergency stop', ...(target === 'user' ? { userId: '1' } : {}) },
      } as unknown as FlowNodeRecord,
      payload,
      {
        resourceId: 1,
        getResourceType: async () => ResourceType.Machine,
        compileTemplate: (template: string) => template,
      } as unknown as NodeExecutionContext,
    );

  /** The end's outcome, observed from the start so a rejection is never unhandled. */
  const track = (ending: Promise<unknown>) => {
    const state: { done: boolean; error?: unknown } = { done: false };
    const finished = ending.then(
      () => void (state.done = true),
      (error: unknown) => void Object.assign(state, { done: true, error }),
    );
    return { state, finished };
  };

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

  const targets = ['all', 'user', 'triggering'] as const;
  const cases = [1, 2].flatMap((limit) => targets.map((target) => [target, limit] as const));

  it.each(cases)('target "%s", limit %i: ends the continuation of a switch that commits', async (target, limit) => {
    const own = await arrange(limit);
    const parked = parkSwitchFlow();
    const switching = scope.usage.switchSessionProject(1, scope.users[0], { projectId: 2, usageId: own.id });
    await parked.entered;

    const end = track(pressEnd(scope.usage, target, { usageId: own.id }));
    await settle();
    parked.release();
    const continuation = await switching;
    await end.finished;

    expect(end.state.error).toBeUndefined();
    const after = await usages();
    expect(after.find((usage) => usage.id === continuation.id)).toMatchObject({
      endTime: expect.any(Date),
      endNotes: expect.stringContaining('emergency stop'),
    });
    expect(await openUserIds()).toEqual(limit > 1 && target !== 'all' ? [2] : []);
    expect(await attempts()).toBe(0);
  });

  it.each(cases)('target "%s", limit %i: ends the old part of a switch that is rolled back', async (target, limit) => {
    const own = await arrange(limit);
    const parked = parkSwitchFlow();
    const switching = scope.usage.switchSessionProject(1, scope.users[0], { projectId: 2, usageId: own.id });
    const refused = expect(switching).rejects.toBeInstanceOf(FlowExecutionError);
    await parked.entered;

    const end = track(pressEnd(scope.usage, target, { usageId: own.id }));
    await settle();
    parked.release(new FlowExecutionError('relay offline'));
    await refused;
    await end.finished;

    expect(end.state.error).toBeUndefined();
    const after = await usages();
    expect(after.filter((usage) => usage.previousUsageId !== null)).toEqual([]);
    expect(after.find((usage) => usage.id === own.id)).toMatchObject({
      endTime: expect.any(Date),
      endNotes: expect.stringContaining('emergency stop'),
    });
    expect(await openUserIds()).toEqual(limit > 1 && target !== 'all' ? [2] : []);
    expect(await attempts()).toBe(0);
  });

  /** A second API instance without a common turn only sees the switch's attempt in the database. */
  it.each(cases)('target "%s", limit %i: reaches the continuation from another instance', async (target, limit) => {
    const own = await arrange(limit);
    const other = forkUsageInstance(scope.usage, () => undefined);
    const parked = parkSwitchFlow();
    const switching = scope.usage.switchSessionProject(1, scope.users[0], { projectId: 2, usageId: own.id });
    await parked.entered;

    const end = track(pressEnd(other, target, { usageId: own.id }));
    await settle();
    parked.release();
    await switching;
    await end.finished;

    expect(end.state.error).toBeUndefined();
    expect(await openUserIds()).toEqual(limit > 1 && target !== 'all' ? [2] : []);
  });

  /** With Valkey the other instance waits for the machine's turn, and gives up after a while. */
  it('keeps waiting for a switch that outlasts the wait for a shared machine', async () => {
    const own = await arrange(2);
    const valkey = new FakeValkey() as never;
    Object.assign(usageInternals(scope.usage).turns, {
      sessionChangeCoordinationInstance: new ValkeySessionChangeCoordination(valkey, 'a'),
    });
    const other = forkUsageInstance(scope.usage, (turns) =>
      Object.assign(turns, {
        sessionChangeQueue: new (Reflect.get(turns, 'sessionChangeQueue').constructor)(),
        sessionChangeCoordinationInstance: new ValkeySessionChangeCoordination(valkey, 'b'),
        sessionChangeWaitMs: 100,
      }),
    );
    const parked = parkSwitchFlow();
    const switching = scope.usage.switchSessionProject(1, scope.users[0], { projectId: 2, usageId: own.id });
    await parked.entered;

    const end = track(pressEnd(other, 'all'));
    await settle();
    expect(end.state.done).toBe(false);
    parked.release();
    await switching;
    await end.finished;

    expect(end.state.error).toBeUndefined();
    expect(await openUserIds()).toEqual([]);
  });

  /** The held-up end names another session than the one being switched: here the older one, which "all" takes first. */
  it.each(['all', 'triggering'] as const)(
    'target "%s": ends another session although a switch holds the shared machine longer than the wait',
    async (target) => {
      await scope.source.getRepository(Resource).update(1, { maxParallelSessions: 2 });
      const others = await scope.usage.startSession(1, scope.users[1], {});
      const own = await scope.usage.startSession(1, scope.users[0], { projectId: 1 });
      Object.assign(usageInternals(scope.usage).turns, { sessionChangeWaitMs: 100 });
      const parked = parkSwitchFlow();
      const switching = scope.usage.switchSessionProject(1, scope.users[0], { projectId: 2, usageId: own.id });
      await parked.entered;

      const end = track(pressEnd(scope.usage, target, { usageId: others.id }));
      await settle();
      expect(end.state.done).toBe(false);
      parked.release();
      await switching;
      await end.finished;

      expect(end.state.error).toBeUndefined();
      expect(await openUserIds()).toEqual(target === 'all' ? [] : [1]);
      expect(await attempts()).toBe(0);
    },
  );

  it('still reports a busy machine when it is not a switch that holds it up', async () => {
    await arrange(2);
    const turns = usageInternals(scope.usage).turns;
    Object.assign(turns, { sessionChangeWaitMs: 100 });
    let release!: () => void;
    const holding = turns.take(1, () => new Promise<void>((resolve) => (release = resolve)));
    await settle();

    await expect(pressEnd(scope.usage, 'user')).rejects.toBeInstanceOf(MachineBusyError);

    release();
    await holding;
  });

  it('leaves a person’s own stop refused while the switch runs', async () => {
    const own = await arrange(1);
    const parked = parkSwitchFlow();
    const switching = scope.usage.switchSessionProject(1, scope.users[0], { projectId: 2, usageId: own.id });
    await parked.entered;

    await expect(scope.usage.endSession(1, scope.users[0], {})).rejects.toThrow(
      'A usage lifecycle operation is already in progress',
    );

    parked.release();
    await switching;
    expect(await openUserIds()).toEqual([1]);
  });

  /** A flow that waited (say a time limit set up at the start) names a part that was switched away since. */
  it.each([1, 2])(
    'limit %i: a late "triggering" end follows the switches made since, and only those',
    async (limit) => {
      const own = await arrange(limit);
      await scope.usage.switchSessionProject(1, scope.users[0], { projectId: 2, usageId: own.id });
      await scope.usage.switchSessionProject(1, scope.users[0], { projectId: null });

      await pressEnd(scope.usage, 'triggering', { usageId: own.id });

      expect(await openUserIds()).toEqual(limit > 1 ? [2] : []);
    },
  );
});
