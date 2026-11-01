import {
  BillingTransaction,
  BillingTransactionItem,
  Resource,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceMeter,
  ResourceMeteringOperation,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
  User,
} from '@attraccess/database-entities';

import { rm } from 'node:fs/promises';

import { closeResourceTransactionConnection } from '../../../database/run-serialized-transaction';

import { resetTestFixture } from './fixtures/setup.test-fixture';

import { createFlowDefinedMeteringFixture } from './fixtures/flow-defined-meters.test-fixture';

import { createGenericMetersFixture } from './fixtures/generic-meters.test-fixture';

import { T } from './fixtures/node-types.test-fixture';

// This SQLite suite runs multiple settlements per case; coverage on CI exceeds Jest's five-second default.
jest.setTimeout(30_000);

describe('Flow-defined metering with parallel sessions', () => {
  async function seedMeter(startData: object = {}, collectData: object = { finalRetryDelaySeconds: 0 }) {
    const nodes = scope.source.getRepository(ResourceFlowNode);
    await nodes.save([
      { id: 'start', type: T.INPUT_METERING_START, resourceId: 1, data: { meterId: 1, ...startData } },
      { id: 'ready', type: T.OUTPUT_METERING_READY, resourceId: 1, data: { meterId: 1 } },
      { id: 'collect', type: T.INPUT_METERING_COLLECT, resourceId: 1, data: { meterId: 1, ...collectData } },
      {
        id: 'report',
        type: T.OUTPUT_METERING_REPORT,
        resourceId: 1,
        data: { meterId: 1, value: '1' },
      },
    ]);
    await scope.source.getRepository(ResourceFlowEdge).save([
      { id: 'e1', source: 'start', sourceHandle: 'output', target: 'ready', targetHandle: 'input', resourceId: 1 },
      { id: 'e2', source: 'collect', sourceHandle: 'output', target: 'report', targetHandle: 'input', resourceId: 1 },
    ]);
  }

  async function items(usageId: number) {
    const transaction = await scope.source
      .getRepository(BillingTransaction)
      .findOneByOrFail({ resourceUsageId: usageId });
    return {
      transaction,
      items: await scope.source
        .getRepository(BillingTransactionItem)
        .find({ where: { billingTransactionId: transaction.id } }),
    };
  }

  const scope = Object.assign(createFlowDefinedMeteringFixture(), { seedMeter, items });

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

  describe('generic meters', () => {
    const genericMetersScope = createGenericMetersFixture(scope);

    it('keeps the meter with the earliest running session when a second person starts (parallel sessions)', async () => {
      await genericMetersScope.seedMeter();
      await genericMetersScope.metering.setRate(1, 1, 30);
      await genericMetersScope.source.getRepository(Resource).update(1, { maxParallelSessions: 2 });
      const onStart = jest.fn(genericMetersScope.onStart);
      genericMetersScope.onStart = onStart;
      const sessions = genericMetersScope.source.getRepository(ResourceMeteringSession);

      const first = await genericMetersScope.usage.startSession(1, genericMetersScope.users[0], {} as never);
      const second = await genericMetersScope.usage.startSession(1, genericMetersScope.users[1], {} as never);

      // The later overlapping session neither re-initializes the meter nor fails the first one.
      expect(onStart).toHaveBeenCalledTimes(1);
      const held = await sessions.find();
      expect(held).toHaveLength(1);
      expect(held[0]).toMatchObject({ usageId: first.id, status: ResourceMeteringSessionStatus.Active });
      expect(await genericMetersScope.metering.listMeters(1)).toEqual([
        expect.objectContaining({ session: expect.objectContaining({ usageId: first.id }) }),
      ]);

      await genericMetersScope.usage.endSession(1, genericMetersScope.users[0], {} as never);
      // The remaining session is never charged the meter consumption.
      await genericMetersScope.usage.endSession(1, genericMetersScope.users[1], {} as never);
      expect(await sessions.countBy({ usageId: second.id })).toBe(0);
    });

    describe('parallel sessions: the meter belongs to whoever claimed it', () => {
      // A simulated cumulative meter: starts report it as baseline, collections as total.
      let counter: number;

      async function setUpSharedMachine(limit: number) {
        await genericMetersScope.seedMeter({}, { finalRetryDelaySeconds: 0, interimIntervalMinutes: 1 });
        await genericMetersScope.metering.setRate(1, 1, 30);
        await genericMetersScope.source.getRepository(Resource).update(1, { maxParallelSessions: limit });
        const third = await genericMetersScope.source.getRepository(User).save({ id: 3, username: 'third-user' });
        genericMetersScope.users.push(Object.assign(third, { effectivePermissions: new Set(['resources.update']) }));
        counter = 100;
        genericMetersScope.onStart = jest.fn(({ complete }) =>
          complete({ kind: 'ready', baseline: { value: String(counter) } }),
        );
        genericMetersScope.onCollect = ({ complete }) => complete({ kind: 'reading', value: String(counter) });
      }

      const start = (user: number) =>
        genericMetersScope.usage.startSession(1, genericMetersScope.users[user], {} as never);
      const end = (user: number) => genericMetersScope.usage.endSession(1, genericMetersScope.users[user], {} as never);
      const charged = async (usageId: number) => (await genericMetersScope.items(usageId)).transaction.amount;
      const meterSessions = () => genericMetersScope.source.getRepository(ResourceMeteringSession);
      const dueForInterimCollection = () =>
        genericMetersScope.source
          .getRepository(ResourceMeter)
          .update(1, { latestObservedAt: new Date(Date.now() - 120_000) });

      it('meters a later session that claims the meter after the holder ended, never the one in between', async () => {
        await setUpSharedMachine(3);
        const a = await start(0);
        counter = 102;
        const b = await start(1);
        expect(genericMetersScope.onStart).toHaveBeenCalledTimes(1);

        // The holder ends while B keeps running: collected and charged as today.
        await end(0);
        expect(await charged(a.id)).toBe(-60);

        counter = 103;
        const c = await start(2);
        expect(genericMetersScope.onStart).toHaveBeenCalledTimes(2);
        expect((await meterSessions().findOneByOrFail({ usageId: c.id })).status).toBe(
          ResourceMeteringSessionStatus.Active,
        );
        // B started earlier, but C holds the meter: the live view shows C's consumption.
        expect((await genericMetersScope.metering.getLive(1)).meters[0].session).toMatchObject({ usageId: c.id });

        counter = 105;
        await dueForInterimCollection();
        await genericMetersScope.metering.collectInterimReadings();
        expect(
          await genericMetersScope.source.getRepository(ResourceMeteringOperation).findOneByOrFail({ kind: 'interim' }),
        ).toMatchObject({ status: 'completed', sessionId: (await genericMetersScope.sessionOf(c.id)).id });
        expect((await genericMetersScope.sessionOf(c.id)).latestValue).toBe('2000000000');
        expect((await genericMetersScope.metering.getLive(1)).meters[0].session).toMatchObject({
          usageId: c.id,
          latestValue: '2',
        });

        // A pushed reading also belongs to C, not to the earlier, unmetered B.
        await genericMetersScope.metering.report(1, 1, { kind: 'reading', value: '105.5' });
        expect((await genericMetersScope.sessionOf(c.id)).latestValue).toBe('2500000000');

        counter = 106;
        await end(2);
        expect(await charged(c.id)).toBe(-90);
        await end(1);
        expect(await charged(b.id)).toBe(0);
        expect(await meterSessions().countBy({ usageId: b.id })).toBe(0);
        expect(await meterSessions().countBy({ status: ResourceMeteringSessionStatus.Failed })).toBe(0);
      });

      it("accepts readings and interim collections for the holder during another person's lifecycle", async () => {
        await setUpSharedMachine(3);
        const a = await start(0);
        const b = await start(1);
        const candidate = await genericMetersScope.source.getRepository(ResourceUsage).save({
          resourceId: 1,
          userId: 3,
          startTime: new Date(),
          isFinalized: false,
          lifecyclePending: true,
        });
        const attempts = genericMetersScope.source.getRepository(ResourceUsageLifecycleAttempt);
        const lifecycle = (id: string, kind: 'start' | 'end', usageId: number) =>
          attempts.save({
            id,
            resourceId: 1,
            kind,
            candidateUsageId: kind === 'start' ? usageId : null,
            previousUsageId: kind === 'end' ? usageId : null,
            transitionTime: new Date(),
            formSubmissions: [],
            billingItems: [],
          });
        await lifecycle('third-start', 'start', candidate.id);
        await lifecycle('second-end', 'end', b.id);

        await genericMetersScope.metering.report(1, 1, { kind: 'reading', value: '101' });
        expect((await genericMetersScope.sessionOf(a.id)).latestValue).toBe('1000000000');
        // Inside the other person's lifecycle flow the reading still belongs to the holder.
        await genericMetersScope.metering.report(1, 1, { kind: 'reading', value: '102' }, undefined, 'third-start');
        expect((await genericMetersScope.sessionOf(a.id)).latestValue).toBe('2000000000');

        counter = 103;
        await dueForInterimCollection();
        await genericMetersScope.metering.collectInterimReadings();
        expect((await genericMetersScope.sessionOf(a.id)).latestValue).toBe('3000000000');

        // Only a lifecycle of the holder itself makes an outside reading ambiguous.
        await lifecycle('first-end', 'end', a.id);
        await expect(genericMetersScope.metering.report(1, 1, { kind: 'reading', value: '104' })).rejects.toThrow(
          'METER_LIFECYCLE_BUSY',
        );
        await genericMetersScope.metering.report(1, 1, { kind: 'reading', value: '104' }, undefined, 'first-end');
        expect((await genericMetersScope.sessionOf(a.id)).latestValue).toBe('4000000000');
      });

      it('lets exactly one of several simultaneous starts claim the meter', async () => {
        await setUpSharedMachine(3);
        // Hold every start right before its meter check, then release them together.
        const metering = genericMetersScope.metering;
        const getDefinition = metering.getDefinition.bind(metering);
        const waiting: (() => void)[] = [];
        jest.spyOn(metering, 'getDefinition').mockImplementation(async (resourceId, meterId) => {
          const definition = await getDefinition(resourceId, meterId);
          if (waiting.length < 2) await new Promise<void>((resolve) => waiting.push(resolve));
          else waiting.splice(0).forEach((release) => release());
          return definition;
        });
        const started = await Promise.all([start(0), start(1), start(2)]);

        const active = await meterSessions().findBy({ meterId: 1, status: ResourceMeteringSessionStatus.Active });
        expect(active).toHaveLength(1);
        expect(started.map((usage) => usage.id)).toContain(active[0].usageId);
        expect(genericMetersScope.onStart).toHaveBeenCalledTimes(1);
        expect((await genericMetersScope.metering.getLive(1)).meters[0].session).toMatchObject({
          usageId: active[0].usageId,
        });
      });
    });
  });
});
