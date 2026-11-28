import {
  BillingTransaction,
  Project,
  Resource,
  ResourceMeteringSegment,
  ResourceMeteringSession,
  ResourceUsage,
  User,
} from '@attraccess/database-entities';
import { ProjectChangeMode, ResourceFlowNodeType, ResourceMeteringSessionStatus } from '@attraccess/application-models';
import { FlowExecutionError } from '../../../resources/flows/errors/flow-execution.error';
import { closeMeteringFixture, resetTestFixture } from './fixtures/setup.test-fixture';
import { createFlowDefinedMeteringFixture } from './fixtures/flow-defined-meters.test-fixture';

jest.setTimeout(60_000);

/** ATT-1421: a project switch is a meter boundary that reads the meter and never initializes it again. */
describe('Metering a project switch', () => {
  const scope = createFlowDefinedMeteringFixture();
  // A simulated cumulative meter: starts report it as baseline, collections as total.
  let counter: number;

  beforeEach(async () => {
    await resetTestFixture(scope);
    await scope.source.getRepository(Project).save([
      { id: 1, name: 'Old', owner: scope.users[0] },
      { id: 2, name: 'New', owner: scope.users[0] },
    ]);
  });

  afterEach(async () => {
    scope.usage?.onModuleDestroy();
    await closeMeteringFixture(scope);
    jest.restoreAllMocks();
  });

  const readCounter = () => {
    scope.onCollect = ({ complete }) => complete({ kind: 'reading', value: String(counter) });
  };

  async function setUpMeter(limit = 1, collect: object = {}) {
    await scope.seedMeter({}, { finalAttempts: 1, finalRetryDelaySeconds: 0, ...collect });
    await scope.metering.setRate(1, 1, 30);
    await scope.source.getRepository(Resource).update(1, { maxParallelSessions: limit });
    counter = 100;
    scope.onStart = jest.fn(({ complete }) => complete({ kind: 'ready', baseline: { value: String(counter) } }));
    readCounter();
  }

  const start = (user = 0) => scope.usage.startSession(1, scope.users[user], { projectId: 1 } as never);
  const switchProject = (user = 0, projectId = 2) =>
    scope.usage.switchSessionProject(1, scope.users[user], { mode: ProjectChangeMode.SPLIT, projectId });
  const end = (user = 0) => scope.usage.endSession(1, scope.users[user], {} as never);
  const charged = async (usageId: number) => Math.abs((await scope.items(usageId)).transaction.amount);
  const meterSessions = () => scope.source.getRepository(ResourceMeteringSession).find({ order: { usageId: 'ASC' } });
  const failSwitchFlow = () => {
    const real = scope.flows.runFlow.getMockImplementation() as (...args: unknown[]) => Promise<unknown[]>;
    scope.flows.runFlow.mockImplementation(async (...args: unknown[]) => {
      if (args[1] === ResourceFlowNodeType.INPUT_RESOURCE_USAGE_PROJECT_SWITCHED) {
        throw new FlowExecutionError('relay offline');
      }
      return real(...args);
    });
    return () => scope.flows.runFlow.mockImplementation(real);
  };

  describe('a session with a meter of its own', () => {
    it('bills consumption before and after the switch to the right part without initializing the meter again', async () => {
      await setUpMeter();
      const first = await start();
      counter = 102;
      const second = await switchProject();
      counter = 107;
      await end();

      expect(await charged(first.id)).toBe(2 * 30);
      expect(await charged(second.id)).toBe(5 * 30);
      expect(scope.onStart).toHaveBeenCalledTimes(1);
      expect(
        (await meterSessions()).map((session) => [session.usageId, session.status, session.consumedValue]),
      ).toEqual([
        [first.id, ResourceMeteringSessionStatus.Settled, '2000000000'],
        [second.id, ResourceMeteringSessionStatus.Settled, '5000000000'],
      ]);
    });

    it('refuses the switch when the meter cannot be read, and the session goes on unchanged', async () => {
      await setUpMeter();
      const first = await start();
      counter = 102;
      scope.onCollect = async () => {
        throw new Error('meter offline');
      };
      scope.log = [];

      await expect(switchProject()).rejects.toThrow('METER_SWITCH_FAILED');

      // No flow of the switch ran, and nothing of it is left.
      expect(scope.log.filter((entry) => entry.startsWith('flow:'))).toEqual([]);
      expect(await scope.source.getRepository(ResourceUsage).find({ select: { id: true, endTime: true } })).toEqual([
        { id: first.id, endTime: null },
      ]);
      expect(await meterSessions()).toHaveLength(1);
      counter = 105;
      readCounter();
      await end();
      expect(await charged(first.id)).toBe(5 * 30);
    });

    it('names the meter and the reason once in the refusal', async () => {
      await setUpMeter();
      await start();
      scope.onCollect = async () => {
        throw new Error('meter offline');
      };
      const [{ meterName }] = await meterSessions();

      await expect(switchProject()).rejects.toMatchObject({
        response: {
          statusCode: 400,
          error: 'Bad Request',
          message: `METER_SWITCH_FAILED: "${meterName}": meter offline`,
        },
      });
    });

    it('says why a tracking-only reading is missing when the meter cannot be read at the switch', async () => {
      await setUpMeter();
      await scope.metering.setRate(1, 1, 0);
      const first = await start();
      counter = 105;
      scope.onCollect = async () => {
        throw new Error('meter offline');
      };

      const second = await switchProject();

      readCounter();
      counter = 112;
      await end();
      expect(
        (await meterSessions()).map(({ usageId, status, consumedValue, failureReason }) => ({
          usageId,
          status,
          consumedValue,
          failureReason,
        })),
      ).toEqual([
        {
          usageId: first.id,
          status: ResourceMeteringSessionStatus.Failed,
          consumedValue: null,
          failureReason:
            'The meter could not be read at the project switch (meter offline); ' +
            'consumption since its last reading is counted after the switch',
        },
        {
          usageId: second.id,
          status: ResourceMeteringSessionStatus.Settled,
          consumedValue: '12000000000',
          failureReason: null,
        },
      ]);
    });

    it('keeps the whole consumption on the session when the switch flow fails after the reading', async () => {
      await setUpMeter();
      const first = await start();
      counter = 102;
      const restore = failSwitchFlow();

      await expect(switchProject()).rejects.toThrow('relay offline');

      restore();
      expect(await meterSessions()).toEqual([
        expect.objectContaining({ usageId: first.id, status: ResourceMeteringSessionStatus.Active }),
      ]);
      counter = 105;
      await end();
      expect(await charged(first.id)).toBe(5 * 30);
      expect(await scope.source.getRepository(BillingTransaction).count()).toBe(1);
    });

    it('gives a reading the switch flow pushed back to the session when the switch is rolled back', async () => {
      await setUpMeter();
      const first = await start();
      counter = 102;
      const real = scope.flows.runFlow.getMockImplementation() as (...args: unknown[]) => Promise<unknown[]>;
      scope.flows.runFlow.mockImplementation(async (...args: unknown[]) => {
        if (args[1] !== ResourceFlowNodeType.INPUT_RESOURCE_USAGE_PROJECT_SWITCHED) return real(...args);
        // A Report meter node of the switch flow, then a node that fails.
        counter = 104;
        const { lifecycleAttemptId } = args[4] as { lifecycleAttemptId: string };
        await scope.metering.report(1, 1, { kind: 'reading', value: String(counter) }, undefined, lifecycleAttemptId);
        throw new FlowExecutionError('relay offline');
      });

      await expect(switchProject()).rejects.toThrow('relay offline');

      scope.flows.runFlow.mockImplementation(real);
      expect(await meterSessions()).toEqual([
        expect.objectContaining({ usageId: first.id, latestValue: '4000000000' }),
      ]);
      counter = 105;
      await end();
      // 100 to 105: none of it is lost with the continuation.
      expect(await charged(first.id)).toBe(5 * 30);
    });

    it('keeps counting correctly over several switches', async () => {
      await setUpMeter();
      const first = await start();
      counter = 101;
      const second = await switchProject(0, 2);
      counter = 104;
      const third = await switchProject(0, 1);
      counter = 109;
      await end();

      expect([await charged(first.id), await charged(second.id), await charged(third.id)]).toEqual([30, 90, 150]);
    });

    it('rounds the meter over many switches like one unsplit session, not each part on its own', async () => {
      await setUpMeter();
      // One credit per unit: 0.46 units, 0.46 credits, round to nothing in each part on its own.
      await scope.metering.setRate(1, 1, 1);
      const consume = (units: number) => (counter = Number((counter + units).toFixed(2)));
      const parts = [await start()];
      for (let index = 0; index < 5; index++) {
        consume(0.46);
        parts.push(await switchProject(0, index % 2 ? 1 : 2));
      }
      consume(0.46);
      await end();
      // The same consumption without a switch.
      const unsplit = await start();
      consume(6 * 0.46);
      await end();

      const split = await Promise.all(parts.map((part) => charged(part.id)));
      // 0.46, 0.92, 1.38, 1.84, 2.30, 2.76 credits so far: each part bills what the run's whole credits grew by.
      expect(split).toEqual([0, 1, 0, 1, 0, 1]);
      expect(await charged(unsplit.id)).toBe(3);
      expect(split.reduce((sum, credits) => sum + credits, 0)).toBe(3);
      expect((await meterSessions()).slice(0, 6).map((session) => Number(session.chargeCredits))).toEqual(split);
    });

    it('rounds a late reading of the last part together with the parts before it', async () => {
      await setUpMeter();
      await scope.metering.setRate(1, 1, 1);
      await start();
      counter = 100.46;
      const last = await switchProject();
      counter = 100.92;
      scope.onCollect = async () => {
        throw new Error('meter offline');
      };
      const ended = await end();
      const pending = (await meterSessions()).find((session) => session.usageId === last.id);
      expect(pending?.status).toBe(ResourceMeteringSessionStatus.Pending);

      scope.onCollect = ({ complete }) =>
        complete({ kind: 'reading', value: String(counter), observedAt: ended.endTime?.toISOString() });
      await scope.metering.retrySettlement(1, pending?.id as string, scope.users[0].id);

      // 0.92 credits after both parts are 1 whole credit; the first part billed none of it.
      expect((await scope.correctionsOf(last.id)).corrections.map((correction) => correction.amount)).toEqual([-1]);
    });
  });

  describe('a meter shared on a machine with parallel sessions', () => {
    async function twoPeople() {
      await setUpMeter(2);
      const other = await scope.source.getRepository(User).findOneByOrFail({ id: scope.users[1].id });
      expect(other).toBeTruthy();
      const a = await start(0);
      counter = 102;
      const b = await start(1);
      counter = 106;
      return { a, b };
    }

    it('splits the segments at the switch, so both parts add up to the unsplit share', async () => {
      const { a, b } = await twoPeople();
      const continuation = await switchProject(0);
      counter = 110;
      await end(0);
      counter = 113;
      await end(1);

      // A: 2 alone + half of 4 (until the switch) | half of 4 (after it). B: half of 4 + half of 4 + 3 alone.
      expect(await charged(a.id)).toBe(4 * 30);
      expect(await charged(continuation.id)).toBe(2 * 30);
      expect(await charged(b.id)).toBe(7 * 30);
      const segments = await scope.source.getRepository(ResourceMeteringSegment).find();
      expect(segments.every((segment) => segment.status === 'closed')).toBe(true);
    });

    it('refuses the switch when the boundary reading fails and splits as if nothing happened', async () => {
      const { a, b } = await twoPeople();
      scope.onCollect = async () => {
        throw new Error('meter offline');
      };

      await expect(switchProject(0)).rejects.toThrow('METER_SWITCH_FAILED');

      expect(await meterSessions()).toHaveLength(2);
      readCounter();
      counter = 108;
      await end(0);
      await end(1);
      // 2 alone for A, then 6 shared by both.
      expect(await charged(a.id)).toBe(5 * 30);
      expect(await charged(b.id)).toBe(3 * 30);
    });

    describe('when a meter that costs the switching person nothing cannot be read at the switch', () => {
      const OWNER = 0;
      const OTHER = 1;

      /** The owner's frozen rate is 0, the other person's is 30: the rate changed between their starts. */
      async function frozenRates(first: typeof OWNER | typeof OTHER) {
        await setUpMeter(2);
        const startAt = async (user: number) => {
          await scope.metering.setRate(1, 1, user === OWNER ? 0 : 30);
          return start(user);
        };
        const earlier = await startAt(first);
        counter = 102;
        const later = await startAt(first === OWNER ? OTHER : OWNER);
        counter = 106;
        return first === OWNER ? { own: earlier, others: later } : { own: later, others: earlier };
      }

      const unreadSwitch = async (projectId: number) => {
        scope.onCollect = async () => {
          throw new Error('meter offline');
        };
        const continuation = await switchProject(OWNER, projectId);
        readCounter();
        return continuation;
      };

      /** What the other person pays and what the owner's whole chain was measured to consume. */
      async function outcome(otherUsageId: number) {
        const sessions = await meterSessions();
        expect(sessions.filter((session) => session.status === ResourceMeteringSessionStatus.Pending)).toEqual([]);
        const consumed = sessions
          .filter((session) => session.usageId !== otherUsageId)
          .reduce((total, session) => total + BigInt(session.consumedValue ?? '0'), BigInt(0));
        const corrections = await scope.correctionsOf(otherUsageId);
        return {
          otherPays:
            (await charged(otherUsageId)) +
            corrections.corrections.reduce((total, correction) => total + Math.abs(correction.amount), 0),
          ownConsumed: consumed,
        };
      }

      async function run(first: typeof OWNER | typeof OTHER, switches: number, stops: number[]) {
        const { others } = await frozenRates(first);
        for (let index = 0; index < switches; index++) await unreadSwitch(index % 2 === 0 ? 2 : 1);
        for (const user of stops) {
          counter += 4;
          await end(user);
        }
        const segments = await scope.source.getRepository(ResourceMeteringSegment).find();
        expect(segments.every((segment) => segment.status === 'closed')).toBe(true);
        return outcome(others.id);
      }

      it.each([
        ['first', 1, OWNER],
        ['first', 3, OWNER],
        ['second', 1, OTHER],
        ['second', 3, OTHER],
      ] as const)(
        'splits like without a switch: the person switching started %s, switches: %i',
        async (_order, switches, first) => {
          const unswitched = await run(first, 0, [OWNER, OTHER]);
          await resetTestFixture(scope);
          await scope.source.getRepository(Project).save([
            { id: 1, name: 'Old', owner: scope.users[0] },
            { id: 2, name: 'New', owner: scope.users[0] },
          ]);

          expect(await run(first, switches, [OWNER, OTHER])).toEqual(unswitched);
        },
      );

      it('says why the part before the switch has no reading when it never had one', async () => {
        const { own } = await frozenRates(OTHER);

        const continuation = await unreadSwitch(2);

        expect((await meterSessions()).find((session) => session.usageId === own.id)).toMatchObject({
          status: ResourceMeteringSessionStatus.Failed,
          consumedValue: null,
          failureReason:
            'The meter could not be read at the project switch (meter offline); ' +
            'consumption since its last reading is counted after the switch',
        });
        expect((await scope.items(own.id)).items.map((item) => item.allocation)).not.toContainEqual(
          expect.objectContaining({ pending: true }),
        );
        await end(OWNER);
        await end(OTHER);
        expect((await meterSessions()).find((session) => session.usageId === continuation.id)?.status).toBe(
          ResourceMeteringSessionStatus.Settled,
        );
      });

      it('keeps what was read before the switch on the part before it', async () => {
        const { own } = await frozenRates(OWNER);

        await unreadSwitch(2);

        // The 2 units the owner used alone, up to the reading at the other person's start.
        expect((await meterSessions()).find((session) => session.usageId === own.id)).toMatchObject({
          status: ResourceMeteringSessionStatus.Settled,
          consumedValue: '2000000000',
          chargeCredits: 0,
        });
      });

      it('gives the session its place back when the switch flow fails afterwards', async () => {
        const { own, others } = await frozenRates(OWNER);
        const restore = failSwitchFlow();

        await expect(unreadSwitch(2)).rejects.toThrow('relay offline');

        restore();
        readCounter();
        expect((await meterSessions()).map((session) => session.usageId)).toEqual([own.id, others.id]);
        counter = 110;
        await end(OWNER);
        await end(OTHER);
        // The owner: 2 alone and half of 8; the other person pays half of 8.
        expect(await outcome(others.id)).toEqual({ otherPays: 4 * 30, ownConsumed: BigInt('6000000000') });
      });

      it('settles the chain once a later reading closes a segment that nobody could read', async () => {
        const { others } = await frozenRates(OWNER);
        await unreadSwitch(2);
        scope.onCollect = async () => {
          throw new Error('meter offline');
        };
        await end(OWNER);
        readCounter();
        counter = 110;
        await end(OTHER);

        expect(await outcome(others.id)).toEqual({ otherPays: 4 * 30, ownConsumed: BigInt('6000000000') });
      });
    });

    it('gives the session its share back when the switch flow fails after the boundary', async () => {
      const { a, b } = await twoPeople();
      const restore = failSwitchFlow();

      await expect(switchProject(0)).rejects.toThrow('relay offline');

      restore();
      counter = 110;
      await end(0);
      await end(1);
      // 2 alone for A, then 8 shared by both, in whatever segments.
      expect(await charged(a.id)).toBe(6 * 30);
      expect(await charged(b.id)).toBe(4 * 30);
    });
  });
});
