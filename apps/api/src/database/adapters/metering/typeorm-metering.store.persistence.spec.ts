import { Logger } from '@nestjs/common';
import {
  BillingTransaction,
  BillingTransactionItem,
  MeteringCollectNodeDataSchema,
  MeteringStartNodeDataSchema,
  Resource,
  ResourceMeter,
  ResourceMeteringOperation,
  ResourceMeteringSegment,
  ResourceMeteringSession,
  ResourceUsage,
  User,
} from '@attraccess/database-entities';
import {
  ResourceMeteringSessionStatus,
  ResourceType,
  ResourceUsageAction,
  SupervisionMode,
} from '@attraccess/application-models';
import type { DataSource } from 'typeorm';
import { MeteringReadings } from '../../../resources/metering/metering-readings';
import { MeteringSegments } from '../../../resources/metering/metering-segments';
import { MeteringSettlement } from '../../../resources/metering/metering-settlement';
import {
  MeteringCollectSettingsSchema,
  MeteringStartSettingsSchema,
} from '../../../resources/metering/metering-definition';
import { MeterNameTakenError } from '../../../resources/metering/metering-store.port';
import {
  closeTestDataSource,
  createTestDatabaseLocation,
  createTestDataSource,
  type TestDatabaseLocation,
} from '../../../test-utils/test-database';
import { EntityManagerResolver } from '../entity-manager-resolver';
import { unitOfWorkFor } from '../shared-unit-of-work';
import { insertRow } from '../usage/migrated-usage-database.test-fixture';
import { TypeOrmMeteringStore } from './typeorm-metering.store';

jest.setTimeout(60_000);

const START = new Date('2026-08-28T10:00:00.000Z');
const END = new Date('2026-08-28T10:30:00.000Z');

/**
 * The guarantees of the metering store against a real database, with two independent connections to one database:
 * what the application relies on when several API instances (or several requests) meter one machine.
 */
describe('TypeOrmMeteringStore with two independent connections', () => {
  let database: TestDatabaseLocation;
  const sources: DataSource[] = [];

  /** One API instance: its own connection, unit of work and store. */
  const connect = async () => {
    const source = await createTestDataSource({ location: database.location });
    sources.push(source);
    const unitOfWork = unitOfWorkFor(source);
    const store = new TypeOrmMeteringStore(new EntityManagerResolver(unitOfWork, source));
    return { source, unitOfWork, store };
  };
  type Instance = Awaited<ReturnType<typeof connect>>;
  let a: Instance;
  let b: Instance;
  let audit: { record: jest.Mock };
  let live: { notifyTransactionUpdate: jest.Mock };

  const settlementOn = (instance: Instance) =>
    new MeteringSettlement(instance.store, instance.unitOfWork, audit as never, live as never, new Logger('test'));
  const readingsOn = (instance: Instance) => new MeteringReadings(instance.store, instance.unitOfWork, new Map());

  /** A finished session of a meter shared with nobody else: its closed segment is only known to the segment table. */
  const seedPendingShare = async () => {
    const { source } = a;
    await source.getRepository(ResourceUsage).save({
      id: 1,
      resourceId: 1,
      userId: 1,
      usageAction: ResourceUsageAction.Usage,
      startTime: START,
      endTime: END,
      isFinalized: true,
    });
    await source
      .getRepository(BillingTransaction)
      .save({ resourceUsageId: 1, userId: 1, amount: 0, status: 'completed' as never });
    await source.getRepository(ResourceMeteringSession).save({
      id: 'session-1',
      resourceId: 1,
      usageId: 1,
      meterId: 1,
      meterName: 'Energy',
      status: ResourceMeteringSessionStatus.Pending,
      creditsPerUnit: 30,
      accounting: 'segmented',
      collectionMode: 'requested',
    });
    await source.getRepository(ResourceMeteringSegment).save({
      id: 'segment-1',
      resourceId: 1,
      meterId: 1,
      status: 'closed',
      startedAt: START,
      endedAt: END,
      startValue: '0',
      endValue: '2000000000',
      participants: [{ usageId: 1, creditsPerUnit: 30 }],
    });
  };
  const correctionRows = async () =>
    (await a.source.getRepository(BillingTransaction).find()).filter((row) => row.correctionOfId !== null);
  const sessionOne = () => a.source.getRepository(ResourceMeteringSession).findOneByOrFail({ id: 'session-1' });

  beforeEach(async () => {
    for (const method of ['debug', 'log', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, method).mockImplementation(() => undefined);
    }
    database = await createTestDatabaseLocation();
    a = await connect();
    b = await connect();
    await a.source.getRepository(Resource).save({
      id: 1,
      name: 'Laser',
      type: ResourceType.Machine,
      supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED,
    });
    await a.source.getRepository(User).save([{ id: 1, username: 'first', email: 'first@example.test' }]);
    // The initiator of the corrections (id 7) is a real user: the bill references it.
    await insertRow(a.source, 'user', { id: 7, username: 'initiator', email: 'initiator@example.test' });
    await a.source.getRepository(ResourceMeter).save({ id: 1, resourceId: 1, name: 'Energy', creditsPerUnit: 30 });
    audit = { record: jest.fn().mockResolvedValue({}) };
    live = { notifyTransactionUpdate: jest.fn().mockResolvedValue(undefined) };
  });

  afterEach(async () => {
    for (const source of sources.splice(0)) await closeTestDataSource(source);
    await database.remove();
    jest.restoreAllMocks();
  });

  describe('accepted observations', () => {
    it('keeps every reading and its nine decimals when both instances report at once', async () => {
      const readings = [readingsOn(a), readingsOn(b)];
      const values = ['1.5', '2.25', '0.000000001', '10'];
      await Promise.all(
        values.map((value, index) =>
          readings[index % 2].report(
            1,
            1,
            { kind: 'reading', mode: 'increment', value },
            undefined,
            undefined,
            `r${index}`,
          ),
        ),
      );
      const meter = await a.store.findMeterById(1);
      expect(meter?.lifetimeValue).toBe('13750000001');
      expect(await a.source.getRepository(ResourceMeteringOperation).count()).toBe(4);
    });

    it('counts a reading once when the same flow node reports it from both instances', async () => {
      const results = await Promise.allSettled(
        [readingsOn(a), readingsOn(b)].map((readings) =>
          readings.report(
            1,
            1,
            { kind: 'reading', mode: 'increment', value: '5' },
            undefined,
            undefined,
            'flow:1:node',
          ),
        ),
      );
      expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
      expect((await a.store.findMeterById(1))?.lifetimeValue).toBe('5000000000');
      expect(await a.source.getRepository(ResourceMeteringOperation).count()).toBe(1);
    });

    it('keeps values beyond the safe integer range exact', async () => {
      await a.store.recordMeterObservation(1, { counterValue: '123456789012345678901234567890123456789' });
      expect((await b.store.findMeterById(1))?.counterValue).toBe('123456789012345678901234567890123456789');
    });

    it('leaves the meter untouched when the unit of work rolls back', async () => {
      await expect(
        a.unitOfWork.run(async (scope) => {
          await a.store.recordMeterObservation(1, { lifetimeValue: '999', counterValue: '999' }, scope);
          throw new Error('abort');
        }),
      ).rejects.toThrow('abort');
      expect(await b.store.findMeterById(1)).toMatchObject({ lifetimeValue: '0', counterValue: null });
    });
  });

  describe('settlement', () => {
    it('bills a pending share once when both instances settle it at the same time', async () => {
      await seedPendingShare();
      const results = await Promise.allSettled([
        settlementOn(a).settleSegmentedLate('session-1', 7),
        settlementOn(b).settleSegmentedLate('session-1', 7),
      ]);
      expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
      const rows = await correctionRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ amount: -60, status: 'completed', initiatorId: 7 });
      const items = await a.source.getRepository(BillingTransactionItem).find();
      expect(items.filter((item) => item.externalReference === 'metering:session-1:segments')).toHaveLength(1);
      expect(await sessionOne()).toMatchObject({
        status: ResourceMeteringSessionStatus.Settled,
        chargeCredits: 60,
        consumedValue: '2000000000',
      });
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(live.notifyTransactionUpdate).toHaveBeenCalledTimes(1);
    });

    it('leaves nothing behind when the audit record cannot be written, and bills on the next try', async () => {
      await seedPendingShare();
      audit.record.mockRejectedValueOnce(new Error('audit down'));
      await expect(settlementOn(a).settleSegmentedLate('session-1', 7)).rejects.toThrow('audit down');
      expect(await correctionRows()).toHaveLength(0);
      expect(await a.source.getRepository(BillingTransactionItem).count()).toBe(0);
      expect((await sessionOne()).status).toBe(ResourceMeteringSessionStatus.Pending);
      expect(live.notifyTransactionUpdate).not.toHaveBeenCalled();

      await settlementOn(b).settleSegmentedLate('session-1', 7);
      expect(await correctionRows()).toHaveLength(1);
      expect((await sessionOne()).status).toBe(ResourceMeteringSessionStatus.Settled);
    });

    it('keeps the price snapshot of the session when the meter rate changes later', async () => {
      await seedPendingShare();
      await a.store.setMeterRate(1, 500);
      await settlementOn(b).settleSegmentedLate('session-1');
      expect((await correctionRows())[0].amount).toBe(-60);
      expect((await sessionOne()).creditsPerUnit).toBe(30);
    });
  });

  describe('segments', () => {
    const hooks = () => ({ runOperation: jest.fn(), settleClosed: jest.fn().mockResolvedValue(undefined) });
    const segmentsOn = (instance: Instance, hook = hooks()) =>
      new MeteringSegments(instance.store, instance.unitOfWork, hook, new Logger('test'));

    it('closes an open segment exactly once when both instances take its closing reading', async () => {
      await a.source.getRepository(ResourceMeteringSegment).save({
        id: 'open-1',
        resourceId: 1,
        meterId: 1,
        status: 'open',
        startedAt: START,
        startValue: '0',
        participants: [{ usageId: 1, creditsPerUnit: 30 }],
      });
      const hook = hooks();
      const close = (instance: Instance) =>
        segmentsOn(instance, hook).close({
          resourceId: 1,
          meterId: 1,
          reading: { value: '3000000000', observedAt: END },
          next: [],
          expectedOpenId: 'open-1',
        });
      const results = await Promise.allSettled([close(a), close(b)]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      const rows = await a.source.getRepository(ResourceMeteringSegment).find();
      expect(rows).toEqual([expect.objectContaining({ id: 'open-1', status: 'closed', endValue: '3000000000' })]);
      expect(hook.settleClosed).toHaveBeenCalledTimes(1);
    });

    it('opens the next segment together with closing the previous one', async () => {
      await a.source.getRepository(ResourceMeteringSegment).save({
        id: 'open-1',
        resourceId: 1,
        meterId: 1,
        status: 'open',
        startedAt: START,
        startValue: '1000000000',
        participants: [{ usageId: 1, creditsPerUnit: 30 }],
      });
      await segmentsOn(b).close({
        resourceId: 1,
        meterId: 1,
        reading: { value: '4000000000', observedAt: END },
        next: [{ usageId: 2, creditsPerUnit: 30 }],
      });
      const open = await a.store.findOpenSegment(1);
      expect(open).toMatchObject({ startValue: '4000000000', participants: [{ usageId: 2, creditsPerUnit: 30 }] });
      expect(await a.store.findSegment('open-1')).toMatchObject({ status: 'closed', endValue: '4000000000' });
    });

    it('finds only the segments a usage took part in, within the usage window', async () => {
      const save = (id: string, usageIds: number[], startedAt: Date, endedAt: Date | null) =>
        a.source.getRepository(ResourceMeteringSegment).save({
          id,
          resourceId: 1,
          meterId: 1,
          status: endedAt ? 'closed' : 'open',
          startedAt,
          endedAt,
          startValue: '0',
          endValue: endedAt ? '1' : null,
          participants: usageIds.map((usageId) => ({ usageId, creditsPerUnit: 1 })),
        });
      await save('before', [1], new Date('2026-08-28T08:00:00Z'), new Date('2026-08-28T09:00:00Z'));
      await save('during', [1, 2], START, END);
      await save('other', [2], START, END);
      await save('after', [1], new Date('2026-08-28T12:00:00Z'), new Date('2026-08-28T13:00:00Z'));
      await save('open', [1], END, null);
      const found = await a.store.findUsageSegments(1, { id: 1, startTime: START, endTime: END });
      expect(found.map((segment) => segment.id)).toEqual(['during', 'open']);
    });
  });

  describe('mapping', () => {
    it('hands out complete session and operation records with their defaults', async () => {
      await a.source
        .getRepository(ResourceUsage)
        .save({
          id: 1,
          resourceId: 1,
          userId: 1,
          usageAction: ResourceUsageAction.Usage,
          startTime: START,
          endTime: END,
        });
      const session = await a.store.createSession({
        id: 'new-session',
        resourceId: 1,
        usageId: 1,
        meterId: 1,
        meterName: 'Energy',
        status: ResourceMeteringSessionStatus.Active,
        creditsPerUnit: 30,
        accounting: 'own',
      });
      expect(session).toMatchObject({
        collectionMode: 'requested',
        latestValue: null,
        baselineValue: null,
        compromisedReason: null,
        settledAt: null,
      });
      const operation = await a.store.createOperation({
        id: 'op-1',
        sessionId: session.id,
        meterId: 1,
        resourceId: 1,
        kind: 'start',
        status: 'pending',
        requestedAt: START,
      });
      expect(operation).toMatchObject({ completedAt: null, totalValue: null, observedAt: null, error: null });
      expect(operation.requestedAt).toEqual(START);
      await a.store.closePendingOperation('op-1', 'expired', 'too slow', END);
      await a.store.closePendingOperation('op-1', 'failed', 'ignored', END);
      expect(await b.store.findOperation('op-1')).toMatchObject({ status: 'expired', error: 'too slow' });
    });

    it('refuses a second meter of the same name with the port error', async () => {
      await expect(a.store.createMeter(1, 'Energy')).rejects.toBeInstanceOf(MeterNameTakenError);
      const created = await a.store.createMeter(1, 'Water');
      expect(created).toMatchObject({ name: 'Water', allocation: 'shared', lifetimeValue: '0' });
      await expect(a.store.renameMeter(1, created.id, 'Energy')).rejects.toBeInstanceOf(MeterNameTakenError);
    });

    it('picks pending sessions by what they may no longer be settled against', async () => {
      await a.source.getRepository(ResourceUsage).save([
        { id: 1, resourceId: 1, userId: 1, usageAction: ResourceUsageAction.Usage, startTime: START, endTime: END },
        { id: 2, resourceId: 1, userId: 1, usageAction: ResourceUsageAction.Usage, startTime: START, endTime: END },
        { id: 3, resourceId: 1, userId: 1, usageAction: ResourceUsageAction.Usage, startTime: START, endTime: END },
      ]);
      const pending = (id: string, usageId: number, accounting: 'own' | 'segmented' | 'per-session') =>
        a.source.getRepository(ResourceMeteringSession).save({
          id,
          resourceId: 1,
          usageId,
          meterId: 1,
          meterName: 'Energy',
          status: ResourceMeteringSessionStatus.Pending,
          creditsPerUnit: 1,
          accounting,
        });
      await pending('own', 1, 'own');
      await pending('segmented', 2, 'segmented');
      await pending('own-session', 3, 'per-session');
      expect((await a.store.findPendingSessionIds(1, { excludeAccounting: ['per-session'] })).sort()).toEqual([
        'own',
        'segmented',
      ]);
      expect(await a.store.findPendingSessionIds(1, { excludeAccounting: ['per-session', 'segmented'] })).toEqual([
        'own',
      ]);
      expect(
        await a.store.findPendingSessionIds(1, { resourceId: 1, usageIdBelow: 2, excludeAccounting: ['per-session'] }),
      ).toEqual(['own']);
    });

    it('fails sessions and takes the pending marker off their unavailable bill lines in one step', async () => {
      await seedPendingShare();
      const bill = await a.source.getRepository(BillingTransaction).findOneByOrFail({ resourceUsageId: 1 });
      await a.source.getRepository(BillingTransactionItem).save({
        billingTransactionId: bill.id,
        name: 'Energy',
        externalReference: 'metering:session-1:unavailable',
        unitPrice: 0,
        quantity: 1,
        allocation: { kind: 'meter', segments: [], pending: true },
      });
      await a.store.failSessions(['session-1'], 'gone');
      expect(await sessionOne()).toMatchObject({ status: ResourceMeteringSessionStatus.Failed, failureReason: 'gone' });
      const [item] = await a.source.getRepository(BillingTransactionItem).find();
      expect(item.allocation).toBeNull();
    });
  });

  describe('flow definition settings', () => {
    it.each([
      ['defaults', { meterId: 1 }],
      [
        'explicit values',
        { meterId: 2, timeoutSeconds: 12, interimIntervalMinutes: 0, finalAttempts: 7, finalRetryDelaySeconds: 0 },
      ],
    ])('parses the start and collect settings like the flow editor does: %s', (_label, data) => {
      expect(MeteringStartSettingsSchema.parse(data)).toEqual(MeteringStartNodeDataSchema.parse(data));
      expect(MeteringCollectSettingsSchema.parse(data)).toEqual(MeteringCollectNodeDataSchema.parse(data));
    });

    it.each([{ meterId: 1, timeoutSeconds: 601 }, { meterId: 1, finalAttempts: 11 }, { meterId: 0 }])(
      'rejects what the flow editor rejects: %j',
      (data) => {
        expect(MeteringCollectNodeDataSchema.safeParse(data).success).toBe(false);
        expect(MeteringCollectSettingsSchema.safeParse(data).success).toBe(false);
      },
    );
  });
});
