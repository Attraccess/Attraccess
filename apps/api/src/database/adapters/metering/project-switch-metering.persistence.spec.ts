import {
  BillingTransaction,
  Project,
  Resource,
  ResourceMeteringSegment,
  ResourceMeteringSession,
  ResourceUsage,
  User,
} from '@attraccess/database-entities';
import { ResourceFlowNodeType, ResourceMeteringSessionStatus } from '@attraccess/application-models';
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
    scope.usage.switchSessionProject(1, scope.users[user], { projectId });
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
