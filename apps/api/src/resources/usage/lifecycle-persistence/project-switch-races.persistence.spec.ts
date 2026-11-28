import { Project, ResourceUsage, ResourceUsageLifecycleAttempt } from '@attraccess/database-entities';
import { ConflictException } from '@nestjs/common';
import {
  closeLifecycleFixture,
  resetTestFixture,
} from '../../../database/adapters/usage/lifecycle-fixtures/setup.test-fixture';
import { createUsageLifecyclePersistenceAroundExternalFlowsFixture } from '../../../database/adapters/usage/lifecycle-fixtures/state.test-fixture';
import type { ResourceUsageService } from '../sessions/resource-usage.service';
import { forkUsageInstance, usageInternals } from '../sessions/fixtures/compose.test-fixture';
import { someoneWaitsForALock } from '../sessions/fixtures/switch-signals.test-fixture';

jest.setTimeout(60_000);

/** ATT-1421: a switch racing a stop, a takeover or another switch never leaves two active parts or a half chain. */
describe('Switching the project of a running session while other changes race it', () => {
  const scope = createUsageLifecyclePersistenceAroundExternalFlowsFixture();

  const usages = () => scope.source.getRepository(ResourceUsage).find({ order: { id: 'ASC' } });
  const attempts = () => scope.source.getRepository(ResourceUsageLifecycleAttempt).count();
  const openSessions = async () => (await usages()).filter((usage) => !usage.endTime);
  const startInProject = () => scope.usage.startSession(1, scope.users[0], { projectId: 1 });
  const switchTo = (service: ResourceUsageService, projectId: number | null, usageId: number) =>
    service.switchSessionProject(1, scope.users[0], { projectId, usageId });

  /** Another API instance on the same database, with its own queue and no common turn: it sees only the database. */
  const otherInstance = () =>
    forkUsageInstance(scope.usage, (turns) =>
      Reflect.set(turns, 'sessionChangeQueue', new (Reflect.get(turns, 'sessionChangeQueue').constructor)()),
    );

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

  /** Parks the next flow run inside the flow; `entered` resolves once the change is waiting there. */
  const parkNextFlow = () => {
    const parked = gate();
    scope.flow.runFlow.mockImplementationOnce(parked.pass);
    return parked;
  };

  /** Holds the transaction that records `action` open, with every row it locked or changed until then. */
  const parkTransactionAt = (action: string) => {
    const parked = gate();
    const { audit } = usageInternals(scope.usage).projectSwitch as unknown as { audit: { record: jest.Mock } };
    audit.record.mockImplementation(async (event: { action: string }) => {
      if (event.action === action) await parked.pass();
    });
    return parked;
  };

  /** At most one published session is open, nothing stays pending, and an ended chain has no open continuation. */
  const expectOneConsistentOutcome = async () => {
    const all = await usages();
    expect(all.filter((usage) => usage.lifecyclePending)).toEqual([]);
    expect(all.filter((usage) => !usage.endTime).length).toBeLessThanOrEqual(1);
    for (const usage of all.filter((candidate) => candidate.previousUsageId !== null)) {
      expect(all.find((candidate) => candidate.id === usage.previousUsageId)?.endTime).not.toBeNull();
    }
    // One continuation per part.
    const continued = all.flatMap((usage) => (usage.previousUsageId === null ? [] : [usage.previousUsageId]));
    expect(new Set(continued).size).toBe(continued.length);
    expect(await attempts()).toBe(0);
  };

  /** The owner's chain: the started part and its continuations, oldest first. */
  const chainOf = async (firstId: number) => {
    const all = await usages();
    const chain = new Set([firstId]);
    for (const usage of all)
      if (usage.previousUsageId !== null && chain.has(usage.previousUsageId)) chain.add(usage.id);
    return all.filter((usage) => chain.has(usage.id));
  };

  /** What the racing calls reported must agree with what the database holds. */
  const expectOutcomesAgree = async (
    firstId: number,
    outcomes: { switches: PromiseSettledResult<unknown>[]; stop?: PromiseSettledResult<unknown> },
  ) => {
    const succeeded = (results: PromiseSettledResult<unknown>[]) =>
      results.filter((result) => result.status === 'fulfilled').length;
    const all = [...outcomes.switches, ...(outcomes.stop ? [outcomes.stop] : [])];
    expect(succeeded(all)).toBeGreaterThanOrEqual(1);
    expect(succeeded(outcomes.switches)).toBeLessThanOrEqual(1);
    const chain = await chainOf(firstId);
    expect(chain).toHaveLength(1 + succeeded(outcomes.switches));
    if (outcomes.stop?.status === 'fulfilled') expect(chain.filter((part) => !part.endTime)).toEqual([]);
    await expectOneConsistentOutcome();
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

  it.each(['this instance', 'another instance'])(
    'refuses a stop, a takeover and a second switch while a switch runs (%s)',
    async (where) => {
      const started = await startInProject();
      const other = where === 'this instance' ? scope.usage : otherInstance();
      const parked = parkNextFlow();
      const switching = switchTo(scope.usage, 2, started.id);
      await parked.entered;

      await expect(other.endSession(1, scope.users[0], {})).rejects.toBeInstanceOf(ConflictException);
      await expect(other.startSession(1, scope.users[1], { forceTakeOver: true })).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(switchTo(other, null, started.id)).rejects.toBeInstanceOf(ConflictException);

      parked.release();
      await switching;
      await expectOneConsistentOutcome();
      expect(await openSessions()).toHaveLength(1);
    },
  );

  it.each(['stop', 'takeover'])('refuses a switch while a %s of the same session runs', async (change) => {
    const started = await startInProject();
    const other = otherInstance();
    const parked = parkNextFlow();
    const running =
      change === 'stop'
        ? scope.usage.endSession(1, scope.users[0], {})
        : scope.usage.startSession(1, scope.users[1], { forceTakeOver: true });
    await parked.entered;

    await expect(switchTo(other, 2, started.id)).rejects.toBeInstanceOf(ConflictException);

    parked.release();
    await running;
    await expectOneConsistentOutcome();
    expect((await usages()).filter((usage) => usage.previousUsageId !== null)).toEqual([]);
  });

  it('never leaves two active parts when switches and a stop arrive at once from two instances', async () => {
    for (let round = 0; round < 5; round++) {
      const started = await startInProject();
      const other = otherInstance();
      const [first, stop, second] = await Promise.allSettled([
        switchTo(scope.usage, 2, started.id),
        other.endSession(1, scope.users[0], { usageId: started.id }),
        switchTo(other, null, started.id),
      ]);
      await expectOutcomesAgree(started.id, { switches: [first, second], stop });
      if ((await openSessions()).length) await scope.usage.endSession(1, scope.users[0], {});
    }
  });

  describe('inside the commit of the switch', () => {
    /** Resolves once `racing` has settled or waits for a row lock of the parked switch, whichever comes first. */
    const settledOrBlocked = async (racing: Promise<unknown>) => {
      let settled = false;
      void racing.finally(() => (settled = true));
      const blocked = () => someoneWaitsForALock(scope.source);
      for (let tries = 0; tries < 200 && !settled && !(await blocked()); tries++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    };

    /** Starts a switch and holds it after the old part ended and the continuation was published, before commit. */
    const switchHeldAtCommit = async () => {
      const started = await startInProject();
      const commit = parkTransactionAt('usage_session.project_switched');
      const switching = switchTo(scope.usage, 2, started.id);
      await commit.entered;
      return { started, switching, commit };
    };

    it.each([
      [
        'a stop naming the old part',
        (other: ResourceUsageService, usageId: number) => other.endSession(1, scope.users[0], { usageId }),
      ],
      ['a stop of the own session', (other: ResourceUsageService) => other.endSession(1, scope.users[0], {})],
    ])('agrees with %s from another instance', async (_name, stop) => {
      const { started, switching, commit } = await switchHeldAtCommit();
      const stopping = Promise.allSettled([stop(otherInstance(), started.id)]);
      await settledOrBlocked(stopping);
      commit.release();

      const [switched, [stopped]] = await Promise.all([Promise.allSettled([switching]), stopping]);
      await expectOutcomesAgree(started.id, { switches: switched, stop: stopped });
    });

    it('agrees with a takeover from another instance', async () => {
      const { started, switching, commit } = await switchHeldAtCommit();
      const takingOver = Promise.allSettled([otherInstance().startSession(1, scope.users[1], { forceTakeOver: true })]);
      await settledOrBlocked(takingOver);
      commit.release();

      const [switched, [takeover]] = await Promise.all([Promise.allSettled([switching]), takingOver]);
      await expectOutcomesAgree(started.id, { switches: switched, stop: takeover });
      const open = await openSessions();
      expect(open.length).toBeLessThanOrEqual(1);
      // A takeover that went through leaves only the new user's session; else the owner's continuation runs on.
      expect(open.map((usage) => usage.userId)).toEqual(takeover.status === 'fulfilled' ? [2] : [1]);
    });
  });
});
