import {
  BillingTransaction,
  Resource,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceMeter,
  ResourceMeteringSegment,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceUsage,
  User,
} from '@attraccess/database-entities';

import { rm } from 'node:fs/promises';

import { closeResourceTransactionConnection } from '../../../database/run-serialized-transaction';

import { resetTestFixture } from './fixtures/setup.test-fixture';

import { createFlowDefinedMeteringFixture } from './fixtures/flow-defined-meters.test-fixture';

// This SQLite suite runs multiple settlements per case; coverage on CI exceeds Jest's five-second default.
jest.setTimeout(30_000);

/** Billing on shared machines (ATT-1191): segments of a shared meter, their split, and meters measured per session. */
describe('Metering on a shared machine', () => {
  const scope = createFlowDefinedMeteringFixture();
  // A simulated cumulative meter: starts report it as baseline, collections as total.
  let counter: number;

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

  async function setUpSharedMachine(limit: number, rate = 30) {
    await scope.seedMeter({}, { finalRetryDelaySeconds: 0, interimIntervalMinutes: 1 });
    await scope.metering.setRate(1, 1, rate);
    await scope.source.getRepository(Resource).update(1, { maxParallelSessions: limit });
    const third = await scope.source.getRepository(User).save({ id: 3, username: 'third-user' });
    scope.users.push(Object.assign(third, { effectivePermissions: new Set(['resources.update']) }));
    counter = 100;
    scope.onStart = jest.fn(({ complete }) => complete({ kind: 'ready', baseline: { value: String(counter) } }));
    scope.onCollect = ({ complete }) => complete({ kind: 'reading', value: String(counter) });
  }

  const start = (user: number) => scope.usage.startSession(1, scope.users[user], {} as never);
  const end = (user: number) => scope.usage.endSession(1, scope.users[user], {} as never);
  const charged = async (usageId: number) => Math.abs((await scope.items(usageId)).transaction.amount);
  const segments = () => scope.source.getRepository(ResourceMeteringSegment).find({ order: { startedAt: 'ASC' } });
  const meterSessions = () => scope.source.getRepository(ResourceMeteringSession);
  const meterItem = async (usageId: number) =>
    (await scope.items(usageId)).items.find((item) => item.name === 'Energy (kWh)');

  describe('shared meter (split)', () => {
    it('reads the meter at every start and stop and splits each segment equally', async () => {
      await setUpSharedMachine(3);

      const a = await start(0);
      counter = 102;
      const b = await start(1);
      // The later start reads the meter; it does not reset what the first one is consuming.
      expect(scope.onStart).toHaveBeenCalledTimes(1);
      counter = 104;
      await end(0);
      counter = 108;
      await end(1);

      // A: 2 kWh alone + half of 2 kWh together = 3 kWh; B: 1 + 4 = 5 kWh. 8 kWh in total at 30 credits.
      expect(await charged(a.id)).toBe(90);
      expect(await charged(b.id)).toBe(150);
      expect(await meterItem(a.id)).toMatchObject({
        unitPrice: 90,
        quantity: 1,
        meterQuantity: '3',
        meterCreditsPerUnit: 30,
        allocation: {
          kind: 'meter',
          segments: [
            expect.objectContaining({ participants: 1, totalQuantity: '2', shareQuantity: '2', shareCredits: 60 }),
            expect.objectContaining({
              participants: 2,
              totalQuantity: '2',
              totalCredits: 60,
              shareQuantity: '1',
              shareCredits: 30,
            }),
          ],
        },
      });
      expect(await meterItem(b.id)).toMatchObject({ unitPrice: 150, meterQuantity: '5' });
      expect(await meterSessions().findBy({ status: ResourceMeteringSessionStatus.Settled })).toHaveLength(2);
      const all = await segments();
      expect(all.map((segment) => segment.status)).toEqual(['closed', 'closed', 'closed']);
      expect(all.map((segment) => segment.participants.map((p) => p.usageId))).toEqual([[a.id], [a.id, b.id], [b.id]]);
    });

    it('bills a session that never overlapped another exactly like a single session', async () => {
      await setUpSharedMachine(3);
      const a = await start(0);
      counter = 101.5;
      await end(0);

      expect(await meterItem(a.id)).toMatchObject({
        unitPrice: 45,
        quantity: 1,
        meterQuantity: '1.5',
        allocation: null,
      });
      const b = await start(1);
      counter = 102;
      await end(1);
      expect(await meterItem(b.id)).toMatchObject({ unitPrice: 15, meterQuantity: '0.5', allocation: null });
    });

    it('charges shares that add up to every segment total, however many people share one credit', async () => {
      await setUpSharedMachine(3, 1);
      const a = await start(0);
      const b = await start(1);
      const c = await start(2);
      counter = 101;
      await end(0);
      await end(1);
      await end(2);

      // 1 kWh at 1 credit between three people: one pays it, the earliest started.
      expect([await charged(a.id), await charged(b.id), await charged(c.id)]).toEqual([1, 0, 0]);
    });

    it('closes no segment at an interim reading but shows the provisional share in the live view', async () => {
      await setUpSharedMachine(3);
      const a = await start(0);
      counter = 102;
      const b = await start(1);
      const before = await segments();
      counter = 106;
      await scope.source.getRepository(ResourceMeter).update(1, { latestObservedAt: new Date(Date.now() - 120_000) });
      await scope.metering.collectInterimReadings();

      expect(await segments()).toHaveLength(before.length);
      const live = (await scope.metering.getLive(1)).meters[0];
      expect(live.sessions.map((session) => session.usageId)).toEqual([a.id, b.id]);
      // A's closed first segment (2 kWh) plus half of the open one (4 kWh), provisional.
      expect(live.sessions[0]).toMatchObject({ shared: true, provisional: true, latestValue: '4', chargeCredits: 120 });
      expect(live.sessions[1]).toMatchObject({ shared: true, provisional: true, latestValue: '2', chargeCredits: 60 });
    });

    it('refuses a start whose meter cannot be read and leaves the running session untouched', async () => {
      await setUpSharedMachine(3);
      const a = await start(0);
      const open = await segments();
      scope.onCollect = async () => {
        throw new Error('meter offline');
      };

      await expect(start(1)).rejects.toThrow('METER_INITIALIZATION_FAILED');

      expect(await meterSessions().findBy({ status: ResourceMeteringSessionStatus.Active })).toHaveLength(1);
      expect(await segments()).toEqual(open);
      expect(await scope.source.getRepository(ResourceUsage).countBy({ endTime: undefined })).toBeGreaterThan(0);
      counter = 101;
      scope.onCollect = ({ complete }) => complete({ kind: 'reading', value: String(counter) });
      await end(0);
      expect(await charged(a.id)).toBe(30);
    });

    it('lets a stop succeed when the meter cannot be read, merges the segment and bills the stopped person later', async () => {
      await setUpSharedMachine(3);
      const a = await start(0);
      counter = 102;
      const b = await start(1);
      counter = 110;
      scope.onCollect = async () => {
        throw new Error('meter offline');
      };

      const ended = await end(1);

      expect(ended.endTime).toBeTruthy();
      const bSession = await scope.sessionOf(b.id);
      expect(bSession.status).toBe(ResourceMeteringSessionStatus.Pending);
      expect(await meterItem(b.id)).toMatchObject({ unitPrice: 0, meterQuantity: null });
      expect((await segments()).filter((segment) => segment.status === 'open')).toHaveLength(1);

      counter = 112;
      scope.onCollect = ({ complete }) => complete({ kind: 'reading', value: String(counter) });
      await end(0);

      // The merged segment (10 kWh, 102 to 112) is split between A and B, who stopped in the middle of it.
      expect(await charged(a.id)).toBe(60 + 150);
      const { corrections, items } = await scope.correctionsOf(b.id);
      expect(corrections).toEqual([expect.objectContaining({ amount: -150, status: 'completed' })]);
      expect(items[0]).toMatchObject({
        unitPrice: 150,
        meterQuantity: '5',
        allocation: { kind: 'meter', segments: [expect.objectContaining({ participants: 2, totalQuantity: '10' })] },
      });
      expect((await scope.sessionOf(b.id)).status).toBe(ResourceMeteringSessionStatus.Settled);
      expect(
        await scope.source.getRepository(BillingTransaction).countBy({ correctionOfId: undefined }),
      ).toBeGreaterThan(0);
    });

    it('keeps every affected session pending when the final reading fails too, and bills them on retry', async () => {
      await setUpSharedMachine(3);
      const a = await start(0);
      counter = 102;
      const b = await start(1);
      counter = 104;
      scope.onCollect = async () => {
        throw new Error('meter offline');
      };
      await end(1);
      await end(0);

      expect((await scope.sessionOf(a.id)).status).toBe(ResourceMeteringSessionStatus.Pending);
      expect((await scope.sessionOf(b.id)).status).toBe(ResourceMeteringSessionStatus.Pending);

      counter = 110;
      const endedA = await scope.source.getRepository(ResourceUsage).findOneByOrFail({ id: a.id });
      scope.onCollect = ({ complete }) =>
        complete({ kind: 'reading', value: String(counter), observedAt: endedA.endTime?.toISOString() });
      const retried = await scope.metering.retrySettlement(1, (await scope.sessionOf(a.id)).id, 1);

      expect(retried.status).toBe(ResourceMeteringSessionStatus.Settled);
      expect((await scope.sessionOf(b.id)).status).toBe(ResourceMeteringSessionStatus.Settled);
      const total = (await scope.correctionsOf(a.id)).corrections.reduce((sum, c) => sum - c.amount, 0);
      const totalB = (await scope.correctionsOf(b.id)).corrections.reduce((sum, c) => sum - c.amount, 0);
      // 10 kWh between 100 and 110 at 30 credits, all of it billed to the two of them.
      expect(total + totalB + (await charged(a.id)) + (await charged(b.id))).toBe(300);
    });

    it('lets a session joined late share from the moment others start, when the limit was raised', async () => {
      await setUpSharedMachine(1);
      const a = await start(0);
      await scope.source.getRepository(Resource).update(1, { maxParallelSessions: 2 });
      counter = 102;
      const b = await start(1);
      counter = 104;
      await end(0);
      counter = 106;
      await end(1);

      // A: 2 alone + 1 shared; B: 1 shared + 2 alone.
      expect(await charged(a.id)).toBe(90);
      expect(await charged(b.id)).toBe(90);
    });

    it('still splits fairly when the limit is lowered while sessions run', async () => {
      await setUpSharedMachine(2);
      const a = await start(0);
      const b = await start(1);
      await scope.source.getRepository(Resource).update(1, { maxParallelSessions: 1 });
      counter = 102;
      await end(0);
      counter = 104;
      await end(1);

      expect(await charged(a.id)).toBe(30);
      expect(await charged(b.id)).toBe(30 + 60);
    });

    it('produces ordered, non-overlapping segments for simultaneous starts and stops', async () => {
      await setUpSharedMachine(3);
      const started = await Promise.all([start(0), start(1), start(2)]);
      counter = 103;
      await Promise.all([end(0), end(1), end(2)]);

      const all = await segments();
      expect(all.every((segment) => segment.status === 'closed')).toBe(true);
      all.slice(1).forEach((segment, index) => {
        expect(segment.startedAt.getTime()).toBe(all[index].endedAt?.getTime());
        expect(segment.startValue).toBe(all[index].endValue);
      });
      // Nothing is lost or counted twice: the segments add up to what the meter counted.
      expect(
        all.reduce((sum, segment) => sum + (BigInt(segment.endValue ?? 0) - BigInt(segment.startValue)), BigInt(0)),
      ).toBe(BigInt(3_000_000_000));
      const total = (await Promise.all(started.map((usage) => charged(usage.id)))).reduce(
        (sum, value) => sum + value,
        0,
      );
      expect(total).toBe(90);
    });
  });

  describe('meter measured per session', () => {
    async function setUpPerSession() {
      await setUpSharedMachine(3);
      await scope.metering.setAllocation(1, 1, 'per-session', 1);
      // Every session has its own measuring point, addressed through the trigger payload.
      const devices = new Map<number, number>();
      scope.onStart = ({ complete }) => {
        // Person 1's measuring point stands at 10 and person 2's at 50 when their session starts.
        const { usageId, userId } = triggerPayload();
        devices.set(usageId, userId === 1 ? 10 : 50);
        return complete({ kind: 'ready', baseline: { value: String(devices.get(usageId)) } });
      };
      scope.onCollect = ({ complete }) => {
        const { usageId } = triggerPayload();
        return complete({ kind: 'reading', value: String(devices.get(usageId) ?? 0) });
      };
      return devices;
    }
    const triggerPayload = () => {
      const call = scope.flows.runFlow.mock.calls.filter(([, , payload]) => payload?.metering).at(-1);
      return call?.[2].metering as { usageId: number; userId: number; sessionId: string };
    };

    it('initializes, reads and settles every session on its own, without a holder', async () => {
      const devices = await setUpPerSession();
      const a = await start(0);
      expect(triggerPayload()).toMatchObject({ usageId: a.id, userId: 1 });
      const b = await start(1);
      expect(triggerPayload()).toMatchObject({ usageId: b.id, userId: 2 });
      expect(scope.log.filter((entry) => entry === 'meter:start')).toHaveLength(2);

      devices.set(a.id, 12);
      devices.set(b.id, 53);
      await end(0);
      await end(1);

      // A counted 12 - 10 and B 53 - 50 on their own measuring points.
      expect(await charged(a.id)).toBe(60);
      expect(await charged(b.id)).toBe(90);
      expect(await segments()).toEqual([]);
      expect((await meterItem(a.id))?.allocation).toBeNull();
    });

    it('rejects a pushed reading that names no session on a machine with several sessions', async () => {
      await setUpPerSession();
      const a = await start(0);
      const b = await start(1);

      await expect(scope.metering.report(1, 1, { kind: 'reading', value: '1' })).rejects.toThrow(
        'Several sessions are running',
      );
      await scope.metering.report(1, 1, { kind: 'reading', value: '52' }, undefined, undefined, undefined, b.id);
      expect((await scope.sessionOf(b.id)).latestValue).toBe('2000000000');
      expect((await scope.sessionOf(a.id)).latestValue).toBeNull();
      await expect(
        scope.metering.report(1, 1, { kind: 'reading', value: '52' }, undefined, undefined, undefined, 999),
      ).rejects.toThrow('no running metering session');
    });

    it('keeps the old fallback for a single running session', async () => {
      await setUpPerSession();
      const a = await start(0);

      await scope.metering.report(1, 1, { kind: 'reading', value: '13' });

      expect((await scope.sessionOf(a.id)).latestValue).toBe('3000000000');
    });
  });

  describe('meters that cannot be read on demand', () => {
    async function setUpIncrementOnly(rate: number) {
      await scope.source.getRepository(ResourceFlowNode).save({
        id: 'report',
        type: scope.T.OUTPUT_METERING_REPORT,
        resourceId: 1,
        data: { meterId: 1, mode: 'increment', value: '1' },
      });
      await scope.source.getRepository(ResourceFlowEdge).save([]);
      await scope.metering.setRate(1, 1, rate);
      await scope.source.getRepository(Resource).update(1, { maxParallelSessions: 2 });
      const third = await scope.source.getRepository(User).save({ id: 3, username: 'third-user' });
      scope.users.push(Object.assign(third, { effectivePermissions: new Set(['resources.update']) }));
    }

    it('flags the meter for a machine with parallel sessions only', async () => {
      await setUpIncrementOnly(30);

      expect((await scope.metering.getStatus(1)).meters[0].problems).toContain('shared-needs-collect');
      await scope.source.getRepository(Resource).update(1, { maxParallelSessions: 1 });
      expect((await scope.metering.getStatus(1)).meters[0].problems).not.toContain('shared-needs-collect');
    });

    it('refuses a billed start that would overlap another session', async () => {
      await setUpIncrementOnly(30);
      await start(0);

      await expect(start(1)).rejects.toThrow('METER_SHARING_UNSUPPORTED');
    });

    it('tracks only, without a meter session, at a rate of 0', async () => {
      await setUpIncrementOnly(0);
      await start(0);
      const b = await start(1);

      expect(await meterSessions().countBy({ usageId: b.id })).toBe(0);
    });
  });
});
