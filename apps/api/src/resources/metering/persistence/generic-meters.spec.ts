import {
  BillingTransaction,
  BillingTransactionItem,
  EmailTemplateType,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceMeter,
  ResourceMeteringOperation,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';

import Handlebars from 'handlebars';

import { rm } from 'node:fs/promises';

import { closeResourceTransactionConnection } from '../../../database/run-serialized-transaction';

import { readDefaultTemplateBody, SHIPPED_TRANSLATIONS } from '../../../email-template/email-defaults';

import { EmailService } from '../../../email/email.service';

import { MeteringReadings } from '../metering-readings';

import { resetTestFixture } from './fixtures/setup.test-fixture';

import { createFlowDefinedMeteringFixture } from './fixtures/flow-defined-meters.test-fixture';

import { createGenericMetersFixture } from './fixtures/generic-meters.test-fixture';

import { createUsageLifecycleFixture } from './fixtures/usage-lifecycle.test-fixture';

import { T } from './fixtures/node-types.test-fixture';

// This SQLite suite runs multiple settlements per case; coverage on CI exceeds Jest's five-second default.
jest.setTimeout(30_000);

export { Handler } from './fixtures/report-handler.test-fixture';

export type GenericMetersTestScope = ReturnType<typeof createGenericMetersFixture>;

export type UsageLifecycleTestScope = ReturnType<typeof createUsageLifecycleFixture>;

describe('Flow-defined metering', () => {
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

    it.each([
      ['report', true],
      ['report', false],
      ['poll', true],
      ['poll', false],
    ] as const)('attributes %s to the newest usage only, initialized=%s', async (path, initialized) => {
      await genericMetersScope.seedMeter();
      await genericMetersScope.metering.setRate(1, 1, 0);
      const { newest, older } = await genericMetersScope.seedLegacyMeterUsages(initialized);
      expect((await genericMetersScope.usage.getActiveSession(1))?.id).toBe(newest.id);
      expect((await genericMetersScope.metering.getLive(1)).meters[0].session).toMatchObject({ usageId: newest.id });

      const report = { kind: 'reading', mode: 'increment', value: '2' } as const;
      if (path === 'report') await genericMetersScope.metering.report(1, 1, report);
      else {
        genericMetersScope.onCollect = ({ complete }) => complete(report);
        await genericMetersScope.metering.collectInterimReadings();
      }

      expect((await genericMetersScope.sessionOf(older.id)).latestValue).toBe('0');
      if (initialized) expect((await genericMetersScope.sessionOf(newest.id)).latestValue).toBe('2000000000');
      else
        expect(
          await genericMetersScope.source.getRepository(ResourceMeteringSession).countBy({ usageId: newest.id }),
        ).toBe(0);
      expect((await genericMetersScope.metering.getLive(1)).meters[0].lifetimeValue).toBe('2');
      expect(
        await genericMetersScope.source.getRepository(ResourceMeteringOperation).findOneByOrFail({ kind: 'interim' }),
      ).toMatchObject({
        status: 'completed',
        sessionId: initialized ? `meter-${newest.id}` : null,
      });
      expect(await genericMetersScope.source.getRepository(BillingTransaction).count()).toBe(0);
    });

    it.each(['start', 'takeover', 'end'] as const)(
      'retains explicit %s lifecycle report targeting over the newest published usage',
      async (kind) => {
        const { newest, older } = await genericMetersScope.seedLegacyMeterUsages(true);
        await genericMetersScope.source.getRepository(ResourceUsage).update(older.id, {
          isFinalized: kind === 'end',
          lifecyclePending: true,
        });
        await genericMetersScope.source.getRepository(ResourceUsageLifecycleAttempt).save({
          id: 'explicit-lifecycle',
          resourceId: 1,
          kind,
          candidateUsageId: kind === 'end' ? null : older.id,
          previousUsageId: kind === 'end' ? older.id : kind === 'takeover' ? newest.id : null,
          transitionTime: new Date(),
          formSubmissions: [],
          billingItems: [],
        });
        const report = { kind: 'reading', mode: 'increment', value: '3' } as const;
        await expect(genericMetersScope.metering.report(1, 1, report)).rejects.toThrow('METER_LIFECYCLE_BUSY');
        await genericMetersScope.metering.report(1, 1, report, undefined, 'explicit-lifecycle');
        expect((await genericMetersScope.sessionOf(older.id)).latestValue).toBe('3000000000');
        expect((await genericMetersScope.sessionOf(newest.id)).latestValue).toBe('0');
      },
    );

    it('excludes unpublished usages and selects the newest legacy session for live meters and reports', async () => {
      const usages = genericMetersScope.source.getRepository(ResourceUsage);
      const sessions = genericMetersScope.source.getRepository(ResourceMeteringSession);
      const seedSession = async (isFinalized: boolean, lifecyclePending: boolean, name: string) => {
        const session = await usages.save({
          resourceId: 1,
          userId: 1,
          startTime: new Date('2026-01-01T00:00:00Z'),
          isFinalized,
          lifecyclePending,
          meterRates: [{ meterId: 1, name, creditsPerUnit: 30 }],
        });
        await sessions.save({
          id: `meter-${session.id}`,
          resourceId: 1,
          usageId: session.id,
          status: ResourceMeteringSessionStatus.Active,
          creditsPerUnit: 30,
          collectionMode: 'increment',
          latestValue: '0',
        });
        return session;
      };

      const orphan = await seedSession(false, false, 'Orphan');
      const pending = await seedSession(true, true, 'Pending end');
      expect((await genericMetersScope.metering.getLive(1)).meters[0].session).toBeNull();
      await genericMetersScope.metering.report(1, 1, { kind: 'reading', mode: 'increment', value: '1' });
      expect((await genericMetersScope.sessionOf(orphan.id)).latestValue).toBe('0');
      expect((await genericMetersScope.sessionOf(pending.id)).latestValue).toBe('0');

      const older = await seedSession(true, false, 'Older');
      const newest = await seedSession(true, false, 'Newest');
      expect((await genericMetersScope.usage.getActiveSession(1))?.id).toBe(newest.id);
      expect((await genericMetersScope.metering.getLive(1)).meters[0].session).toMatchObject({
        usageId: newest.id,
        meterName: 'Newest',
      });
      await genericMetersScope.metering.report(1, 1, { kind: 'reading', mode: 'increment', value: '2' });
      expect((await genericMetersScope.sessionOf(newest.id)).latestValue).toBe('2000000000');
      expect((await genericMetersScope.sessionOf(older.id)).latestValue).toBe('0');
      expect((await genericMetersScope.sessionOf(orphan.id)).latestValue).toBe('0');
      expect((await genericMetersScope.sessionOf(pending.id)).latestValue).toBe('0');
      expect((await genericMetersScope.metering.getLive(1)).meters[0].lifetimeValue).toBe('3');
    });

    it('preserves concurrent consumption and pricing when renaming a meter', async () => {
      const manager = genericMetersScope.source.manager;
      const findOne = manager.findOne.bind(manager);
      jest.spyOn(manager, 'findOne').mockImplementationOnce(async (...args) => {
        const snapshot = await findOne(...args);
        await manager.update(ResourceMeter, 1, {
          lifetimeValue: '3000000000',
          counterValue: '3000000000',
          creditsPerUnit: 99,
        });
        return snapshot;
      });
      await genericMetersScope.metering.updateMeter(1, 1, 'Renamed');
      expect((await genericMetersScope.metering.listMeters(1))[0]).toEqual(
        expect.objectContaining({
          name: 'Renamed',
          lifetimeValue: '3',
          counterValue: '3',
          creditsPerUnit: 99,
        }),
      );
    });

    it('loads one flow snapshot for all meters in a status poll', async () => {
      await genericMetersScope.seedMeter();
      await genericMetersScope.metering.createMeter(1, 'Heartbeats');
      const nodes = jest.spyOn(genericMetersScope.source.getRepository(ResourceFlowNode), 'find');
      const edges = jest.spyOn(genericMetersScope.source.getRepository(ResourceFlowEdge), 'find');
      expect((await genericMetersScope.metering.getStatus(1)).meters).toHaveLength(2);
      expect(nodes).toHaveBeenCalledTimes(1);
      expect(edges).toHaveBeenCalledTimes(1);
    });

    it('allows resource usage when a tracking-only start fails', async () => {
      await genericMetersScope.seedMeter();
      await genericMetersScope.metering.setRate(1, 1, 0);
      genericMetersScope.onStart = async () => {
        throw new Error('offline');
      };
      const started = await genericMetersScope.usage.startSession(1, genericMetersScope.users[0], {} as never);
      expect(started.endTime).toBeNull();
      expect(await genericMetersScope.source.getRepository(ResourceMeteringSession).count()).toBe(0);
      await genericMetersScope.usage.endSession(1, genericMetersScope.users[0], {} as never);
      expect((await genericMetersScope.items(started.id)).transaction.amount).toBe(0);
    });

    it.each(['failed', 'unconfigured'])(
      'exposes captured unavailable terms after a %s free-meter start',
      async (start) => {
        await genericMetersScope.metering.setRate(1, 1, 0);
        if (start === 'failed') {
          await genericMetersScope.seedMeter();
          genericMetersScope.onStart = async () => {
            throw new Error('offline');
          };
        }
        const started = await genericMetersScope.usage.startSession(1, genericMetersScope.users[0], {} as never);
        expect(await genericMetersScope.source.getRepository(ResourceMeteringSession).count()).toBe(0);
        await genericMetersScope.metering.updateMeter(1, 1, 'Renamed later');
        await genericMetersScope.metering.setRate(1, 1, 99);
        const unavailable = {
          sessionId: null,
          usageId: started.id,
          meterName: 'Energy (kWh)',
          creditsPerUnit: 0,
          latestValue: null,
          chargeCredits: null,
          latestObservedAt: null,
          source: null,
        };
        expect((await genericMetersScope.metering.listMeters(1))[0]).toMatchObject({
          name: 'Renamed later',
          creditsPerUnit: 99,
          session: unavailable,
        });
        expect((await genericMetersScope.metering.getLive(1)).meters[0].session).toEqual(unavailable);

        const usages = genericMetersScope.source.getRepository(ResourceUsage);
        await usages.update(started.id, { meterRates: [] });
        expect((await genericMetersScope.metering.listMeters(1))[0].session).toBeNull();
        await usages.update(started.id, { meterRates: started.meterRates, lifecyclePending: true });
        expect((await genericMetersScope.metering.listMeters(1))[0].session).toBeNull();
        await usages.update(started.id, { lifecyclePending: false });
        await genericMetersScope.usage.endSession(1, genericMetersScope.users[0], {} as never);
        expect((await genericMetersScope.metering.listMeters(1))[0].session).toBeNull();
        expect((await genericMetersScope.items(started.id)).transaction.amount).toBe(0);
      },
    );

    it('rejects an idle collection reply after an increment session starts', async () => {
      await genericMetersScope.seedMeter();
      await genericMetersScope.source.getRepository(ResourceMeter).update(1, { counterValue: '100000000000' });
      let reply!: () => Promise<void>;
      let signal!: () => void;
      const waiting = new Promise<void>((resolve) => {
        signal = resolve;
      });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      genericMetersScope.onCollect = async ({ complete }) => {
        reply = () => complete({ kind: 'reading', value: '105' });
        signal();
        await gate;
      };
      const collection = genericMetersScope.metering.collectInterimReadings();
      await waiting;
      await genericMetersScope.source.getRepository(ResourceFlowNode).delete({ resourceId: 1 });
      await genericMetersScope.source.getRepository(ResourceFlowNode).save({
        id: 'increment-report',
        resourceId: 1,
        type: genericMetersScope.T.OUTPUT_METERING_REPORT,
        data: { meterId: 1, mode: 'increment', value: '1' },
      });
      const started = await genericMetersScope.usage.startSession(1, genericMetersScope.users[0], {} as never);
      try {
        await expect(reply()).rejects.toThrow('session boundary');
        expect((await genericMetersScope.metering.listMeters(1))[0].counterValue).toBe('100');
        expect((await genericMetersScope.sessionOf(started.id)).latestValue).toBe('0');
      } finally {
        release();
        await collection;
      }
    });

    it.each([
      ['failed', false],
      ['failed', true],
      ['unconfigured', false],
      ['unconfigured', true],
    ])('rejects an idle reply crossing a %s free-meter start, ended=%s', async (start, ended) => {
      await genericMetersScope.seedMeter();
      await genericMetersScope.metering.setRate(1, 1, 0);
      await genericMetersScope.source.getRepository(ResourceMeter).update(1, { counterValue: '100000000000' });
      await genericMetersScope.source.getRepository(ResourceMeteringOperation).save({
        id: 'outstanding-idle',
        resourceId: 1,
        meterId: 1,
        sessionId: null,
        kind: 'interim',
        status: 'pending',
        requestedAt: new Date(),
      });
      if (start === 'failed') {
        genericMetersScope.onStart = async () => {
          throw new Error('offline');
        };
      } else {
        await genericMetersScope.source.getRepository(ResourceFlowNode).delete(['start', 'ready']);
        await genericMetersScope.source.getRepository(ResourceFlowEdge).delete('e1');
      }
      const started = await genericMetersScope.usage.startSession(1, genericMetersScope.users[0], {} as never);
      expect(await genericMetersScope.source.getRepository(ResourceMeteringSession).count()).toBe(0);
      expect(await genericMetersScope.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
      if (ended) await genericMetersScope.usage.endSession(1, genericMetersScope.users[0], {} as never);
      await expect(
        new MeteringReadings(genericMetersScope.source.manager, new Map()).complete('outstanding-idle', {
          kind: 'reading',
          value: '105',
        }),
      ).rejects.toThrow('session boundary');
      expect((await genericMetersScope.metering.listMeters(1))[0].counterValue).toBe('100');
      expect((await genericMetersScope.metering.listMeters(1))[0].lifetimeValue).toBe('0');
      expect((await genericMetersScope.items(started.id)).transaction.amount).toBe(0);
    });

    it.each([
      ['failed', 'increment'],
      ['failed', 'total'],
      ['unconfigured', 'increment'],
      ['unconfigured', 'total'],
    ] as const)('keeps lifetime polling after a %s free-meter start, mode=%s', async (start, mode) => {
      await genericMetersScope.seedMeter({}, { interimIntervalMinutes: 1 });
      await genericMetersScope.metering.setRate(1, 1, 0);
      await genericMetersScope.source.getRepository(ResourceMeter).update(1, { counterValue: '100000000000' });
      if (start === 'failed') {
        genericMetersScope.onStart = async () => {
          throw new Error('offline');
        };
      } else {
        await genericMetersScope.source.getRepository(ResourceFlowNode).delete(['start', 'ready']);
        await genericMetersScope.source.getRepository(ResourceFlowEdge).delete('e1');
      }
      const started = await genericMetersScope.usage.startSession(1, genericMetersScope.users[0], {} as never);
      expect(await genericMetersScope.source.getRepository(ResourceMeteringSession).count()).toBe(0);
      // Keep the poll strictly after the persisted boundary, even on fast machines.
      await genericMetersScope.source
        .getRepository(ResourceUsage)
        .update(started.id, { startTime: new Date(Date.now() - 1_000) });
      genericMetersScope.onCollect = genericMetersScope.reading(mode === 'increment' ? '5' : '105', { mode });
      await genericMetersScope.metering.collectInterimReadings();
      expect((await genericMetersScope.metering.listMeters(1))[0]).toMatchObject({
        counterValue: '105',
        lifetimeValue: '5',
      });
      const operation = await genericMetersScope.source
        .getRepository(ResourceMeteringOperation)
        .findOneByOrFail({ kind: 'interim' });
      expect(operation).toMatchObject({ status: 'completed', sessionId: null });
      await genericMetersScope.usage.endSession(1, genericMetersScope.users[0], {} as never);
      const bill = await genericMetersScope.items(started.id);
      expect(bill.transaction.amount).toBe(0);
      expect(bill.items).toMatchObject([{ unitPrice: 0, meterQuantity: null, meterCreditsPerUnit: 0 }]);
    });

    it('rejects a lifetime poll that crosses the end of a skipped free-meter usage', async () => {
      await genericMetersScope.seedMeter({}, { interimIntervalMinutes: 1 });
      await genericMetersScope.metering.setRate(1, 1, 0);
      await genericMetersScope.source.getRepository(ResourceMeter).update(1, { counterValue: '100000000000' });
      genericMetersScope.onStart = async () => {
        throw new Error('offline');
      };
      const started = await genericMetersScope.usage.startSession(1, genericMetersScope.users[0], {} as never);
      await genericMetersScope.source
        .getRepository(ResourceUsage)
        .update(started.id, { startTime: new Date(Date.now() - 1_000) });
      genericMetersScope.onCollect = async ({ complete }) => {
        await genericMetersScope.usage.endSession(1, genericMetersScope.users[0], {} as never);
        await complete({ kind: 'reading', mode: 'increment', value: '5' });
      };
      await genericMetersScope.metering.collectInterimReadings();
      expect(genericMetersScope.log).toContain('meter:interim');
      const operation = await genericMetersScope.source
        .getRepository(ResourceMeteringOperation)
        .findOneByOrFail({ kind: 'interim' });
      expect(operation).toMatchObject({ status: 'failed', error: expect.stringContaining('session boundary') });
      expect((await genericMetersScope.metering.listMeters(1))[0]).toMatchObject({
        counterValue: '100',
        lifetimeValue: '0',
      });
      expect((await genericMetersScope.items(started.id)).transaction.amount).toBe(0);
    });

    it('rejects a sessionless poll dispatched after a metering session became active', async () => {
      await genericMetersScope.seedMeter();
      const started = await genericMetersScope.usage.startSession(1, genericMetersScope.users[0], {} as never);
      await genericMetersScope.source
        .getRepository(ResourceUsage)
        .update(started.id, { startTime: new Date(Date.now() - 1_000) });
      // A queued poll may have selected no session before initialization completed.
      await genericMetersScope.source.getRepository(ResourceMeteringOperation).save({
        id: 'queued-lifetime-poll',
        resourceId: 1,
        meterId: 1,
        sessionId: null,
        kind: 'interim',
        status: 'pending',
        requestedAt: new Date(),
      });
      await expect(
        new MeteringReadings(genericMetersScope.source.manager, new Map()).complete('queued-lifetime-poll', {
          kind: 'reading',
          mode: 'increment',
          value: '5',
        }),
      ).rejects.toThrow('session boundary');
      expect((await genericMetersScope.metering.listMeters(1))[0].lifetimeValue).toBe('0');
      expect((await genericMetersScope.sessionOf(started.id)).latestValue).toBeNull();
    });

    it('records increments without a session and keeps other meters independent', async () => {
      const other = await genericMetersScope.metering.createMeter(1, 'Heartbeats');
      await genericMetersScope.metering.report(1, other.id, { kind: 'reading', mode: 'increment', value: '2.5' });
      await genericMetersScope.metering.report(1, other.id, { kind: 'reading', mode: 'increment', value: '3.25' });
      const meters = await genericMetersScope.metering.listMeters(1);
      expect(meters.find((m) => m.id === other.id)).toEqual(
        expect.objectContaining({ lifetimeValue: '5.75', session: null }),
      );
      expect(meters.find((m) => m.id === 1)?.lifetimeValue).toBe('0');
      expect(await genericMetersScope.source.getRepository(ResourceMeteringSession).count()).toBe(0);
      await expect(genericMetersScope.metering.report(99, other.id, { kind: 'reading', value: '1' })).rejects.toThrow(
        'METER_NOT_FOUND',
      );
    });

    it.each([0, 30])(
      'rejects delayed idle increments after an increment-only session starts at rate %s',
      async (rate) => {
        await genericMetersScope.metering.setRate(1, 1, rate);
        await genericMetersScope.source.getRepository(ResourceFlowNode).save({
          id: 'increment-report',
          resourceId: 1,
          type: genericMetersScope.T.OUTPUT_METERING_REPORT,
          data: { meterId: 1, mode: 'increment', value: '1' },
        });
        await genericMetersScope.metering.report(1, 1, {
          kind: 'reading',
          mode: 'increment',
          value: '3',
          observedAt: new Date(Date.now() - 60_000).toISOString(),
        });
        const started = await genericMetersScope.usage.startSession(1, genericMetersScope.users[0], {} as never);
        await expect(
          genericMetersScope.metering.report(1, 1, {
            kind: 'reading',
            mode: 'increment',
            value: '5',
            observedAt: new Date(started.startTime.getTime() - 1).toISOString(),
          }),
        ).rejects.toThrow('older than the required boundary');
        expect((await genericMetersScope.metering.listMeters(1))[0].lifetimeValue).toBe('3');
        expect((await genericMetersScope.sessionOf(started.id)).latestValue).toBe('0');
        expect(await genericMetersScope.source.getRepository(ResourceMeteringOperation).count()).toBe(1);

        // An observation exactly on the persisted start boundary belongs to the session.
        await genericMetersScope.metering.report(1, 1, {
          kind: 'reading',
          mode: 'increment',
          value: '2',
          observedAt: started.startTime.toISOString(),
        });
        await genericMetersScope.usage.endSession(1, genericMetersScope.users[0], {} as never);
        expect((await genericMetersScope.metering.listMeters(1))[0].lifetimeValue).toBe('5');
        expect((await genericMetersScope.items(started.id)).transaction.amount).toBe(rate === 0 ? 0 : -2 * rate);
      },
    );

    it('uses the first cumulative reading as a baseline and never double-counts repeated totals', async () => {
      await genericMetersScope.metering.report(1, 1, { kind: 'reading', value: '100' });
      await genericMetersScope.metering.report(1, 1, { kind: 'reading', value: '102.25' });
      await genericMetersScope.metering.report(1, 1, { kind: 'reading', value: '102.25' });
      expect((await genericMetersScope.metering.listMeters(1))[0].lifetimeValue).toBe('2.25');
      await expect(genericMetersScope.metering.report(1, 1, { kind: 'reading', value: '99' })).rejects.toThrow(
        'counter decreased',
      );
      expect((await genericMetersScope.metering.listMeters(1))[0].lifetimeValue).toBe('2.25');
    });

    it('bills multiple meters at captured rates and names while idle increments remain unbilled', async () => {
      await genericMetersScope.seedMeter();
      const other = await genericMetersScope.metering.createMeter(1, 'Heartbeats');
      await genericMetersScope.metering.setRate(1, other.id, 2);
      await genericMetersScope.source.getRepository(ResourceFlowNode).save({
        id: 'heartbeat-report',
        resourceId: 1,
        type: genericMetersScope.T.OUTPUT_METERING_REPORT,
        data: { meterId: other.id, mode: 'increment', value: '1' },
      });
      await genericMetersScope.metering.report(1, other.id, { kind: 'reading', mode: 'increment', value: '4' });
      const started = await genericMetersScope.usage.startSession(1, genericMetersScope.users[0], {} as never);
      await genericMetersScope.metering.setRate(1, other.id, 100);
      await genericMetersScope.metering.updateMeter(1, other.id, 'Renamed heartbeats');
      await genericMetersScope.metering.report(1, other.id, { kind: 'reading', mode: 'increment', value: '3' });
      await genericMetersScope.metering.report(1, other.id, { kind: 'reading', mode: 'increment', value: '2' });
      expect((await genericMetersScope.metering.getLive(1)).meters.find((meter) => meter.id === other.id)).toEqual(
        expect.objectContaining({
          name: 'Renamed heartbeats',
          creditsPerUnit: 100,
          session: expect.objectContaining({ meterName: 'Heartbeats', creditsPerUnit: 2, latestValue: '5' }),
        }),
      );
      await genericMetersScope.usage.endSession(1, genericMetersScope.users[0], {} as never);
      const bill = await genericMetersScope.items(started.id);
      expect(bill.transaction.amount).toBe(-55);
      expect(bill.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Heartbeats', meterQuantity: '5', meterCreditsPerUnit: 2, unitPrice: 10 }),
          expect.objectContaining({ name: 'Energy (kWh)', meterQuantity: '1.5', unitPrice: 45 }),
        ]),
      );
      await genericMetersScope.metering.report(1, other.id, { kind: 'reading', mode: 'increment', value: '7' });
      expect((await genericMetersScope.metering.listMeters(1)).find((m) => m.id === other.id)?.lifetimeValue).toBe(
        '16',
      );
      expect((await genericMetersScope.items(started.id)).transaction.amount).toBe(-55);
    });

    it('counts alternating cumulative readings and increments once while idle', async () => {
      await genericMetersScope.metering.report(1, 1, { kind: 'reading', value: '100' });
      await genericMetersScope.metering.report(1, 1, { kind: 'reading', mode: 'increment', value: '2' });
      await genericMetersScope.metering.report(1, 1, { kind: 'reading', value: '103' });
      expect((await genericMetersScope.metering.listMeters(1))[0]).toEqual(
        expect.objectContaining({ lifetimeValue: '3', counterValue: '103', session: null }),
      );
    });

    it('bills mixed session readings once and excludes consumption before the session', async () => {
      await genericMetersScope.seedMeter();
      await genericMetersScope.metering.report(1, 1, { kind: 'reading', value: '100' });
      genericMetersScope.onStart = ({ complete }) => complete({ kind: 'ready', baseline: { value: '100' } });
      const started = await genericMetersScope.usage.startSession(1, genericMetersScope.users[0], {} as never);
      await genericMetersScope.metering.report(1, 1, { kind: 'reading', mode: 'increment', value: '2' });
      await genericMetersScope.metering.report(1, 1, { kind: 'reading', value: '103' });
      expect((await genericMetersScope.metering.listMeters(1))[0].session?.latestValue).toBe('3');
      genericMetersScope.onCollect = genericMetersScope.reading('104');
      await genericMetersScope.usage.endSession(1, genericMetersScope.users[0], {} as never);
      expect((await genericMetersScope.items(started.id)).transaction.amount).toBe(-120);
      expect((await genericMetersScope.metering.listMeters(1))[0].lifetimeValue).toBe('4');
    });

    it.each(['total', undefined])('rejects mixed push-only definitions with a %s report', async (mode) => {
      await genericMetersScope.metering.report(1, 1, { kind: 'reading', value: '100' });
      await genericMetersScope.source.getRepository(ResourceFlowNode).save([
        {
          id: 'increment-report',
          resourceId: 1,
          type: genericMetersScope.T.OUTPUT_METERING_REPORT,
          data: { meterId: 1, mode: 'increment', value: '1' },
        },
        {
          id: 'total-report',
          resourceId: 1,
          type: genericMetersScope.T.OUTPUT_METERING_REPORT,
          data: { meterId: 1, mode, value: '105' },
        },
      ]);
      expect(await genericMetersScope.metering.getDefinition(1, 1)).toMatchObject({
        configured: false,
        incrementOnly: false,
      });
      await expect(genericMetersScope.usage.startSession(1, genericMetersScope.users[0], {} as never)).rejects.toThrow(
        'METER_NOT_CONFIGURED',
      );
      expect(await genericMetersScope.source.getRepository(ResourceMeteringSession).count()).toBe(0);
      expect((await genericMetersScope.metering.getLive(1)).meters[0]).toMatchObject({
        lifetimeValue: '0',
        counterValue: '100',
      });
    });

    it('rejects cumulative readings after an increment session definition changes', async () => {
      await genericMetersScope.metering.report(1, 1, { kind: 'reading', value: '100' });
      await genericMetersScope.source.getRepository(ResourceFlowNode).save({
        id: 'increment-report',
        resourceId: 1,
        type: genericMetersScope.T.OUTPUT_METERING_REPORT,
        data: { meterId: 1, mode: 'increment', value: '1' },
      });
      const started = await genericMetersScope.usage.startSession(1, genericMetersScope.users[0], {} as never);
      await genericMetersScope.metering.report(1, 1, { kind: 'reading', mode: 'increment', value: '2' });
      // Adding fresh boundary branches cannot retroactively establish the original start baseline.
      await genericMetersScope.seedMeter();
      expect(await genericMetersScope.metering.getDefinition(1, 1)).toMatchObject({
        configured: true,
        incrementOnly: false,
      });
      await expect(genericMetersScope.metering.report(1, 1, { kind: 'reading', value: '105' })).rejects.toThrow(
        'increment-only',
      );
      expect((await genericMetersScope.metering.getLive(1)).meters[0]).toMatchObject({
        lifetimeValue: '2',
        counterValue: '102',
        session: { latestValue: '2' },
      });
      await genericMetersScope.metering.report(1, 1, { kind: 'reading', mode: 'increment', value: '1' });
      await genericMetersScope.usage.endSession(1, genericMetersScope.users[0], {} as never);
      expect((await genericMetersScope.items(started.id)).transaction.amount).toBe(-90);
      expect((await genericMetersScope.metering.listMeters(1))[0].lifetimeValue).toBe('3');
    });

    it('keeps tracking-only meters live during sessions', async () => {
      await genericMetersScope.seedMeter();
      await genericMetersScope.metering.setRate(1, 1, 0);
      const started = await genericMetersScope.usage.startSession(1, genericMetersScope.users[0], {} as never);
      const session = await genericMetersScope.sessionOf(started.id);
      genericMetersScope.onCollect = genericMetersScope.reading('3');
      await genericMetersScope.metering['runOperation'](session, 'interim', {
        trigger: genericMetersScope.T.INPUT_METERING_COLLECT,
        timeoutSeconds: 5,
      });
      expect((await genericMetersScope.metering.getLive(1)).meters[0]).toEqual(
        expect.objectContaining({
          lifetimeValue: '3',
          session: expect.objectContaining({ latestValue: '3', chargeCredits: 0 }),
        }),
      );
      await genericMetersScope.usage.endSession(1, genericMetersScope.users[0], {} as never);
      expect((await genericMetersScope.items(started.id)).items).toEqual([
        expect.objectContaining({ meterQuantity: '3', meterCreditsPerUnit: 0, unitPrice: 0 }),
      ]);
    });

    // Multiple SQLite settlements and receipt rendering run slower under CI coverage.
    it.each(['en', 'de'])(
      'carries paid, free, zero and unavailable meter evidence from settlement into the %s receipt',
      async (locale) => {
        await genericMetersScope.seedMeter({}, { finalAttempts: 1 });
        const meters = genericMetersScope.source.getRepository(ResourceMeter);
        const free = await meters.save({ resourceId: 1, name: 'Free Heartbeats', creditsPerUnit: 0 });
        const zero = await meters.save({ resourceId: 1, name: 'Zero Heartbeats', creditsPerUnit: 0 });
        const unavailable = await meters.save({ resourceId: 1, name: 'PER_MINUTE', creditsPerUnit: 17 });
        const nodes = genericMetersScope.source.getRepository(ResourceFlowNode);
        const edges = genericMetersScope.source.getRepository(ResourceFlowEdge);
        for (const meter of [free, zero, unavailable]) {
          for (const node of await nodes.find({ where: { resourceId: 1 } })) {
            if (node.data.meterId !== 1) continue;
            await nodes.save({ ...node, id: `${node.id}-${meter.id}`, data: { ...node.data, meterId: meter.id } });
          }
          await edges.save([
            {
              id: `start-${meter.id}`,
              resourceId: 1,
              source: `start-${meter.id}`,
              sourceHandle: 'output',
              target: `ready-${meter.id}`,
              targetHandle: 'input',
            },
            {
              id: `collect-${meter.id}`,
              resourceId: 1,
              source: `collect-${meter.id}`,
              sourceHandle: 'output',
              target: `report-${meter.id}`,
              targetHandle: 'input',
            },
          ]);
        }
        const started = await genericMetersScope.usage.startSession(1, genericMetersScope.users[0], {} as never);
        await genericMetersScope.metering.updateMeter(1, free.id, 'Renamed later');
        await genericMetersScope.metering.setRate(1, free.id, 100);
        genericMetersScope.onCollect = async ({ complete, meterId }) => {
          if (meterId === unavailable.id) throw new Error('Device offline');
          await complete({ kind: 'reading', value: meterId === zero.id ? '0' : '1.5' });
        };
        await genericMetersScope.usage.endSession(1, genericMetersScope.users[0], {} as never);
        const bill = await genericMetersScope.items(started.id);
        expect(bill.transaction.amount).toBe(-45);
        expect(bill.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'Energy (kWh)',
              meterQuantity: '1.5',
              meterCreditsPerUnit: 30,
              unitPrice: 45,
            }),
            expect.objectContaining({
              name: 'Free Heartbeats',
              meterQuantity: '1.5',
              meterCreditsPerUnit: 0,
              unitPrice: 0,
            }),
            expect.objectContaining({
              name: 'Zero Heartbeats',
              meterQuantity: '0',
              meterCreditsPerUnit: 0,
              unitPrice: 0,
            }),
            expect.objectContaining({ name: 'PER_MINUTE', meterQuantity: null, meterCreditsPerUnit: 17, unitPrice: 0 }),
          ]),
        );
        expect(bill.items).toHaveLength(4);
        const email = Object.create(EmailService.prototype) as EmailService;
        const sendEmail = jest.fn();
        Object.assign(email, { getBaseContext: async () => ({}), sendEmail });
        const storedUsage = await genericMetersScope.source
          .getRepository(ResourceUsage)
          .findOneOrFail({ where: { id: started.id }, relations: ['resource'] });
        await email.sendResourceUsageBillingSummaryEmail(
          Object.assign(genericMetersScope.users[0], { email: 'owner@example.com', locale }),
          Object.assign(bill.transaction, { items: bill.items }),
          storedUsage,
          2,
        );
        const context = sendEmail.mock.calls[0][2];
        const renderer = Handlebars.create();
        renderer.registerHelper('t', (key, fallback, options) => {
          const value =
            SHIPPED_TRANSLATIONS.find(
              (row) =>
                row.templateType === EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY &&
                row.locale === locale &&
                row.key === key,
            )?.value ?? fallback;
          return String(value).replace(/\{(\w+)\}/g, (_match, name) => String(options.hash[name] ?? ''));
        });
        const receipt = renderer.compile(
          readDefaultTemplateBody(EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY),
        )(context);
        for (const name of ['Free Heartbeats', 'Zero Heartbeats', 'PER_MINUTE']) expect(receipt).toContain(name);
        expect(receipt).toContain(locale === 'de' ? 'Nicht verfügbar' : 'Unavailable');
        expect(receipt).not.toContain('Renamed later');
        expect(context.items.find((item: { name: string }) => item.name === 'PER_MINUTE')).toMatchObject({
          isUnavailable: true,
          isDuration: false,
          quantity: '—',
        });
        expect(context.totalCredits).toBe('0.45');
        expect(context.usage.roundedMinutes).toBeUndefined();
        const before = await genericMetersScope.items(started.id);
        const pending = await genericMetersScope.source
          .getRepository(ResourceMeteringSession)
          .findOneByOrFail({ usageId: started.id, meterId: unavailable.id });
        genericMetersScope.onCollect = genericMetersScope.reading('2', {
          observedAt: storedUsage.endTime?.toISOString(),
        });
        await genericMetersScope.metering.retrySettlement(1, pending.id, genericMetersScope.users[0].id);
        expect(await genericMetersScope.items(started.id)).toEqual(before);
        expect((await genericMetersScope.correctionsOf(started.id)).corrections).toEqual([
          expect.objectContaining({ amount: -34 }),
        ]);
      },
      30_000,
    );

    it('periodically collects idle consumption without adding it to the completed bill', async () => {
      await genericMetersScope.seedMeter();
      const started = await genericMetersScope.usage.startSession(1, genericMetersScope.users[0], {} as never);
      await genericMetersScope.usage.endSession(1, genericMetersScope.users[0], {} as never);
      await genericMetersScope.source
        .getRepository(ResourceMeter)
        .update(1, { latestObservedAt: new Date(Date.now() - 3_600_000) });
      genericMetersScope.onCollect = genericMetersScope.reading('2.5');
      await genericMetersScope.metering.collectInterimReadings();
      expect((await genericMetersScope.metering.listMeters(1))[0]).toEqual(
        expect.objectContaining({ lifetimeValue: '2.5', session: null }),
      );
      expect((await genericMetersScope.items(started.id)).transaction.amount).toBe(-45);
      expect(
        (await genericMetersScope.source.getRepository(ResourceMeteringOperation).find()).some(
          (operation) => operation.sessionId === null,
        ),
      ).toBe(true);
    });

    it('keeps an increment session billable after its flow is edited', async () => {
      await genericMetersScope.seedMeter();
      await genericMetersScope.source.getRepository(ResourceFlowNode).delete({ resourceId: 1 });
      await genericMetersScope.source.getRepository(ResourceFlowNode).save({
        id: 'increment-report',
        resourceId: 1,
        type: genericMetersScope.T.OUTPUT_METERING_REPORT,
        data: { meterId: 1, mode: 'increment', value: '1' },
      });
      const started = await genericMetersScope.usage.startSession(1, genericMetersScope.users[0], {} as never);
      await genericMetersScope.metering.report(1, 1, { kind: 'reading', mode: 'increment', value: '2' });
      await genericMetersScope.source.getRepository(ResourceFlowNode).delete({ resourceId: 1 });
      await genericMetersScope.usage.endSession(1, genericMetersScope.users[0], {} as never);
      expect((await genericMetersScope.items(started.id)).transaction.amount).toBe(-60);
      expect((await genericMetersScope.sessionOf(started.id)).status).toBe(ResourceMeteringSessionStatus.Settled);
    });

    it('keeps requested sessions pending when flow edits remove final collection', async () => {
      await genericMetersScope.seedMeter();
      const started = await genericMetersScope.usage.startSession(1, genericMetersScope.users[0], {} as never);
      await genericMetersScope.metering.report(1, 1, { kind: 'reading', value: '2' });
      await genericMetersScope.source.getRepository(ResourceFlowNode).delete({ resourceId: 1 });
      await genericMetersScope.source.getRepository(ResourceFlowNode).save({
        id: 'increment-report',
        resourceId: 1,
        type: genericMetersScope.T.OUTPUT_METERING_REPORT,
        data: { meterId: 1, mode: 'increment', value: '1' },
      });
      genericMetersScope.onCollect = async () => {
        throw new Error('The collection branch was removed');
      };
      const definition = await genericMetersScope.metering.getDefinition(1, 1);
      expect(definition.incrementOnly).toBe(true);
      // Skip the default retry delay in this unavailable-collection regression.
      jest.spyOn(genericMetersScope.metering, 'getDefinition').mockResolvedValue({
        ...definition,
        collect: { ...definition.collect, finalAttempts: 1, finalRetryDelaySeconds: 0 },
      });
      await genericMetersScope.usage.endSession(1, genericMetersScope.users[0], {} as never);
      expect(await genericMetersScope.sessionOf(started.id)).toMatchObject({
        collectionMode: 'requested',
        status: ResourceMeteringSessionStatus.Pending,
        latestValue: '2000000000',
        chargeCredits: null,
      });
      expect((await genericMetersScope.items(started.id)).transaction.amount).toBe(0);
    });

    it('does not charge idle consumption when a missing final reading is retried', async () => {
      await genericMetersScope.seedMeter();
      const started = await genericMetersScope.usage.startSession(1, genericMetersScope.users[0], {} as never);
      genericMetersScope.onCollect = async () => {
        throw new Error('offline');
      };
      await genericMetersScope.usage.endSession(1, genericMetersScope.users[0], {} as never);
      const session = await genericMetersScope.sessionOf(started.id);
      expect(session.status).toBe(ResourceMeteringSessionStatus.Pending);
      await genericMetersScope.metering.report(1, 1, { kind: 'reading', value: '3' });
      expect((await genericMetersScope.sessionOf(started.id)).status).toBe(ResourceMeteringSessionStatus.Failed);
      await expect(
        genericMetersScope.metering.retrySettlement(1, session.id, genericMetersScope.users[0].id),
      ).rejects.toThrow();
      expect((await genericMetersScope.items(started.id)).transaction.amount).toBe(0);
    });

    it('records one increment per flow node execution and rejects conflicting replays', async () => {
      const report = { kind: 'reading' as const, mode: 'increment' as const, value: '3' };
      await genericMetersScope.metering.report(1, 1, report, undefined, undefined, 'flow:1:node');
      await genericMetersScope.metering.report(1, 1, report, undefined, undefined, 'flow:1:node');
      expect((await genericMetersScope.metering.listMeters(1))[0].lifetimeValue).toBe('3');
      await expect(
        genericMetersScope.metering.report(1, 1, { ...report, value: '4' }, undefined, undefined, 'flow:1:node'),
      ).rejects.toThrow('conflicting');
    });

    it.each([{ observedAt: '2020-01-01T00:00:00Z' }, { observedAt: 'invalid' }, { source: 'different-device' }])(
      'rejects conflicting replay evidence %j for ordinary and collected readings',
      async (conflict) => {
        const report = { kind: 'reading' as const, mode: 'increment' as const, value: '3', source: 'device' };
        await genericMetersScope.metering.report(1, 1, report, undefined, undefined, 'ordinary');
        await genericMetersScope.metering.report(1, 1, report, undefined, undefined, 'ordinary');
        await expect(
          genericMetersScope.metering.report(1, 1, { ...report, ...conflict }, undefined, undefined, 'ordinary'),
        ).rejects.toThrow('conflicting');
        const observedAt = new Date().toISOString();
        const operation = await genericMetersScope.source.getRepository(ResourceMeteringOperation).save({
          id: 'collection',
          meterId: 1,
          resourceId: 1,
          kind: 'interim',
          status: 'pending',
          requestedAt: new Date(),
        });
        await genericMetersScope.metering['readings'].complete(operation.id, { ...report, observedAt });
        await genericMetersScope.metering['readings'].complete(operation.id, { ...report, observedAt });
        await expect(
          genericMetersScope.metering['readings'].complete(operation.id, { ...report, observedAt, ...conflict }),
        ).rejects.toThrow('answered');
        expect((await genericMetersScope.metering.listMeters(1))[0].lifetimeValue).toBe('6');
      },
    );
  });
});
