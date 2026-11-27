import {
  Resource,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceMeter,
  ResourceMeteringOperation,
  ResourceMeteringSegment,
  ResourceMeteringSession,
  ResourceUsage,
} from '@attraccess/database-entities';
import { ResourceMeteringSessionStatus, ResourceType, ResourceUsageAction } from '@attraccess/application-models';
import { MeterRemoval } from '../../../resources/metering/meter-removal';
import { EntityManagerResolver } from '../entity-manager-resolver';
import { TypeOrmFlowResourceDirectory } from '../flows/typeorm-flow-resource-directory';
import { TypeOrmUsageSessionStore } from '../usage/typeorm-usage-session.store';
import { createFlowDefinedMeteringFixture } from './fixtures/flow-defined-meters.test-fixture';
import { closeMeteringFixture, createMeteringPersistence, resetTestFixture } from './fixtures/setup.test-fixture';

jest.setTimeout(30_000);

const ADMIN = 1;
const ACTOR = { id: ADMIN, authenticationMethod: 'session' } as const;
const increment = { kind: 'reading', mode: 'increment', value: '2' } as const;

describe('Archiving, restoring and deleting meters', () => {
  const scope = createFlowDefinedMeteringFixture();
  let removal: MeterRemoval;
  let persistence: ReturnType<typeof createMeteringPersistence>;

  beforeEach(async () => {
    await resetTestFixture(scope);
    persistence = createMeteringPersistence(scope.source);
    removal = new MeterRemoval(persistence.store, persistence.unitOfWork, scope.audit as never);
  });

  afterEach(async () => {
    scope.usage?.onModuleDestroy();
    await closeMeteringFixture(scope);
    jest.restoreAllMocks();
  });

  const archive = () => removal.archive(1, 1, ACTOR);
  const restore = () => removal.restore(1, 1, ACTOR);
  const remove = () => removal.delete(1, 1, ACTOR);
  /** What a manager sees: only they learn whether a meter can be deleted. */
  const deletable = async () => (await scope.metering.listMeters(1, { withDeletable: true }))[0].deletable;
  const meterRow = () => scope.source.getRepository(ResourceMeter).findOneBy({ id: 1 });
  const start = () => scope.usage.startSession(1, scope.users[0], {} as never);
  const end = () => scope.usage.endSession(1, scope.users[0], {} as never);
  const meterRates = () =>
    new TypeOrmUsageSessionStore(new EntityManagerResolver(persistence.unitOfWork, scope.source)).findMeterRates(1);
  const auditedActions = () => scope.audit.record.mock.calls.map(([event]) => event.action);
  const counts = async () => ({
    sessions: await scope.source.getRepository(ResourceMeteringSession).count(),
    operations: await scope.source.getRepository(ResourceMeteringOperation).count(),
    segments: await scope.source.getRepository(ResourceMeteringSegment).count(),
  });
  const openUsage = (extra: Partial<ResourceUsage> = {}) =>
    scope.source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: scope.users[0].id,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date(),
      isFinalized: true,
      ...extra,
    });
  const captured = [{ meterId: 1, name: 'Energy (kWh)', creditsPerUnit: 0 }];

  /** A finished session whose final reading failed: its charge is pending. */
  async function pendingCharge() {
    await scope.seedMeter();
    await start();
    scope.onCollect = async () => {
      throw new Error('offline');
    };
    const ended = await end();
    const session = await scope.sessionOf(ended.id);
    expect(session.status).toBe(ResourceMeteringSessionStatus.Pending);
    return { ended, session };
  }

  describe('archive', () => {
    it('hides the meter everywhere new work looks for one, keeps it for managers and audits once', async () => {
      await scope.seedMeter();
      const directory = new TypeOrmFlowResourceDirectory(scope.source);
      expect(await directory.meterIds(1)).toEqual([1]);

      const archived = await archive();

      expect(archived).toMatchObject({ id: 1, archivedAt: expect.any(Date), sessions: [], deletable: true });
      expect(await scope.metering.listMeters(1)).toEqual([]);
      expect((await scope.metering.getLive(1)).meters).toEqual([]);
      expect((await scope.metering.getStatus(1)).meters).toEqual([]);
      expect(await scope.metering.listMeters(1, { includeArchived: true })).toHaveLength(1);
      expect(await directory.meterIds(1)).toEqual([]);
      expect(await meterRates()).toEqual([]);

      const again = await archive();
      expect(again.archivedAt).toEqual(archived.archivedAt);
      expect(auditedActions()).toEqual(['meter.archived']);
      expect(scope.audit.record).toHaveBeenCalledWith({
        domain: 'resource',
        action: 'meter.archived',
        actor: { id: ADMIN, authenticationMethod: 'session' },
        subject: { type: 'resource', id: 1 },
        details: { meterId: 1, meterName: 'Energy (kWh)' },
      });
    });

    it('is neither captured, initialized nor collected by later sessions and the cron', async () => {
      await scope.seedMeter();
      await archive();

      const started = await start();
      await scope.metering.collectInterimReadings();
      await end();

      expect(started.meterRates).toEqual([]);
      expect(scope.log.filter((entry) => entry.startsWith('meter:'))).toEqual([]);
      expect(await counts()).toEqual({ sessions: 0, operations: 0, segments: 0 });
    });

    it('refuses a reported reading, with and without a running session, and records nothing', async () => {
      await archive();
      await expect(scope.metering.report(1, 1, increment)).rejects.toThrow('METER_ARCHIVED');
      await start();
      await expect(scope.metering.report(1, 1, increment)).rejects.toThrow('METER_ARCHIVED');
      expect(await meterRow()).toMatchObject({ lifetimeValue: '0', latestObservedAt: null });
      expect(await counts()).toEqual({ sessions: 0, operations: 0, segments: 0 });
    });

    it('refuses the late reply of a periodic collection and sends no further one', async () => {
      await scope.seedMeter();
      const requested = { id: null, meterId: 1, resourceId: 1, usageId: null };
      const options = { trigger: scope.T.INPUT_METERING_COLLECT, timeoutSeconds: 5 };
      scope.onCollect = async (metering) => {
        await archive();
        await scope.reading('3')(metering);
      };
      await expect(scope.metering['runOperation'](requested, 'interim', options)).rejects.toThrow('METER_ARCHIVED');
      expect((await meterRow())?.lifetimeValue).toBe('0');

      scope.log = [];
      await expect(scope.metering['runOperation'](requested, 'interim', options)).rejects.toThrow('METER_ARCHIVED');
      expect(scope.log).toEqual([]);
    });

    it.each(['a session measuring it', 'captured terms without a session', 'a start still in progress'])(
      'is refused, like a deletion, while a running usage has %s',
      async (situation) => {
        if (situation === 'a session measuring it') {
          await scope.seedMeter();
          await start();
        } else {
          await openUsage({
            meterRates: captured,
            ...(situation === 'a start still in progress' ? { isFinalized: false, lifecyclePending: true } : {}),
          });
        }
        await expect(archive()).rejects.toThrow('METER_IN_USE');
        await expect(remove()).rejects.toThrow('METER_IN_USE');
        expect(await meterRow()).toMatchObject({ archivedAt: null });
        expect(await deletable()).toBe(false);
        expect(auditedActions()).toEqual([]);
      },
    );

    it('is refused while a running usage without captured terms holds a metering session', async () => {
      const usage = await openUsage();
      await scope.source.getRepository(ResourceMeteringSession).save({
        id: 'legacy',
        resourceId: 1,
        usageId: usage.id,
        meterId: 1,
        meterName: 'Energy (kWh)',
        status: ResourceMeteringSessionStatus.Active,
        creditsPerUnit: 30,
      });
      await expect(archive()).rejects.toThrow('METER_IN_USE');
      await expect(remove()).rejects.toThrow('METER_IN_USE');
    });

    it('is not initialized for a running usage that captured no terms', async () => {
      await scope.seedMeter();
      await archive();
      const usage = await openUsage({ meterRates: null });
      await scope.metering.initialize({ resourceId: 1, usageId: usage.id });
      expect(scope.log.filter((entry) => entry.startsWith('meter:'))).toEqual([]);
      expect(await counts()).toEqual({ sessions: 0, operations: 0, segments: 0 });
    });

    /** What a session start does: it takes the lifecycle lock, reads the meters and inserts the usage. */
    it('waits for a start that is capturing meters and then sees what it captured', async () => {
      let release: () => void = () => undefined;
      let locked: () => void = () => undefined;
      const hasLock = new Promise<void>((resolve) => (locked = resolve));
      const proceed = new Promise<void>((resolve) => (release = resolve));
      const starting = persistence.unitOfWork.run(async (transaction) => {
        await persistence.store.lockUsageLifecycle(1, transaction);
        locked();
        await proceed;
        await persistence.unitOfWork.handleOf(transaction).save(ResourceUsage, {
          resourceId: 1,
          userId: scope.users[0].id,
          usageAction: ResourceUsageAction.Usage,
          startTime: new Date(),
          isFinalized: false,
          lifecyclePending: true,
          meterRates: captured,
        });
      });
      await hasLock;
      let settled = false;
      const archiving = archive().finally(() => (settled = true));
      const refused = expect(archiving).rejects.toThrow('METER_IN_USE');
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(settled).toBe(false);
      release();
      await starting;
      await refused;
    });

    /**
     * Holds the next call of `method` open after it ran, until `release()`. The other action must start from the test
     * body: started inside the held call, it would join that call's transaction.
     */
    function pauseAfter<T extends object>(target: T, method: keyof T & string) {
      const original = target[method] as (...args: unknown[]) => Promise<unknown>;
      let reached: () => void = () => undefined;
      let release: () => void = () => undefined;
      const hasRun = new Promise<void>((resolve) => (reached = resolve));
      const proceed = new Promise<void>((resolve) => (release = resolve));
      jest.spyOn(target, method as never).mockImplementationOnce(async function (this: unknown, ...args: unknown[]) {
        const result = await original.apply(this, args);
        reached();
        await proceed;
        return result;
      } as never);
      return { hasRun, release };
    }
    /** Long enough for the other action to reach the lock and wait there. */
    const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

    it('refuses an archive that comes while a start is capturing the meter', async () => {
      await scope.seedMeter();
      const paused = pauseAfter(TypeOrmUsageSessionStore.prototype, 'findMeterRates');
      const starting = start();
      await paused.hasRun;
      const refused = expect(archive()).rejects.toThrow('METER_IN_USE');
      await settle();
      paused.release();
      expect((await starting).meterRates).toEqual([expect.objectContaining({ meterId: 1 })]);
      await refused;
      expect(await meterRow()).toMatchObject({ archivedAt: null });
    });

    it('lets a start that comes while the meter is being archived run without it', async () => {
      await scope.seedMeter();
      const paused = pauseAfter(persistence.store, 'setMeterArchivedAt');
      const archiving = archive();
      await paused.hasRun;
      const starting = start();
      await settle();
      paused.release();
      await archiving;
      expect((await starting).meterRates).toEqual([]);
      expect((await meterRow())?.archivedAt).not.toBeNull();
      expect((await counts()).sessions).toBe(0);
    });

    it('keeps a pending charge listed, and a retry bills it', async () => {
      const { ended, session } = await pendingCharge();
      await archive();
      expect((await scope.metering.getStatus(1)).unsettled).toEqual([
        expect.objectContaining({ sessionId: session.id, retryable: true }),
      ]);

      scope.onCollect = scope.reading('1.5', { observedAt: ended.endTime?.toISOString() });
      await scope.metering.retrySettlement(1, session.id, ADMIN);

      expect((await scope.correctionsOf(ended.id)).corrections[0].amount).toBe(-45);
      expect((await meterRow())?.lifetimeValue).toBe('1500000000');
    });

    it('lets a pending charge be waived, also after the collect branch is gone', async () => {
      const { session } = await pendingCharge();
      await archive();
      await scope.source.getRepository(ResourceFlowEdge).delete({ id: 'e2' });
      scope.onCollect = async () => {
        throw new Error('no collect branch');
      };
      await expect(scope.metering.retrySettlement(1, session.id, ADMIN)).rejects.toThrow('METER_SETTLEMENT_FAILED');
      expect((await scope.metering.waive(1, session.id, ADMIN)).status).toBe(ResourceMeteringSessionStatus.Waived);
    });
  });

  describe('restore', () => {
    it('brings the meter back and audits once', async () => {
      await archive();
      expect(await restore()).toMatchObject({ archivedAt: null });
      await restore();
      expect((await scope.metering.listMeters(1)).map((meter) => meter.id)).toEqual([1]);
      expect(auditedActions()).toEqual(['meter.archived', 'meter.restored']);
      expect(scope.audit.record).toHaveBeenLastCalledWith(
        expect.objectContaining({ actor: ACTOR, details: { meterId: 1, meterName: 'Energy (kWh)' } }),
      );
    });

    it('frees the name for a new meter and refuses to restore until one of the two is renamed', async () => {
      await archive();
      const replacement = await scope.metering.createMeter(1, 'Energy (kWh)');
      await expect(restore()).rejects.toThrow('METER_NAME_EXISTS');
      expect((await meterRow())?.archivedAt).not.toBeNull();
      expect(auditedActions()).toEqual(['meter.archived']);
      await expect(scope.metering.createMeter(1, 'Energy (kWh)')).rejects.toThrow('METER_NAME_EXISTS');

      // An archived meter can be renamed, also to the name of an active one.
      expect(await scope.metering.updateMeter(1, 1, 'Old energy')).toMatchObject({ name: 'Old energy' });
      await scope.metering.updateMeter(1, 1, replacement.name);
      await scope.metering.updateMeter(1, 1, 'Old energy');
      expect(await restore()).toMatchObject({ name: 'Old energy', archivedAt: null });
    });
  });

  describe('delete', () => {
    it.each(['active', 'archived'])('removes an %s meter without history and audits it', async (state) => {
      if (state === 'archived') await archive();
      const asManager = await scope.metering.listMeters(1, { includeArchived: true, withDeletable: true });
      expect(asManager[0].deletable).toBe(true);
      // Only managers learn whether a meter can be deleted.
      expect((await scope.metering.listMeters(1, { includeArchived: true }))[0].deletable).toBe(false);
      await remove();
      expect(await meterRow()).toBeNull();
      expect(scope.audit.record).toHaveBeenLastCalledWith({
        domain: 'resource',
        action: 'meter.deleted',
        actor: ACTOR,
        subject: { type: 'resource', id: 1 },
        details: { meterId: 1, meterName: 'Energy (kWh)' },
      });
    });

    it('removes a meter that flow nodes still select, and leaves the nodes', async () => {
      await scope.seedMeter();
      await remove();
      expect(await meterRow()).toBeNull();
      expect(await new TypeOrmFlowResourceDirectory(scope.source).meterIds(1)).toEqual([]);
      expect(await scope.source.getRepository(ResourceFlowNode).countBy({ resourceId: 1 })).toBeGreaterThan(0);
    });

    it('records who deleted it through an API token', async () => {
      await removal.delete(1, 1, { id: ADMIN, authenticationMethod: 'api-token', apiTokenId: 4 });
      expect(scope.audit.record).toHaveBeenLastCalledWith(
        expect.objectContaining({ actor: { id: ADMIN, authenticationMethod: 'api-token', apiTokenId: 4 } }),
      );
    });

    it.each([
      ['lifetimeValue', { lifetimeValue: '1' }],
      ['counterValue', { counterValue: '0' }],
      ['latestObservedAt', { latestObservedAt: new Date() }],
    ])('keeps a meter with a recorded %s', async (_field, patch) => {
      await scope.source.getRepository(ResourceMeter).update(1, patch);
      expect(await deletable()).toBe(false);
      await expect(remove()).rejects.toThrow('METER_HAS_HISTORY');
      expect(await meterRow()).not.toBeNull();
    });

    it.each(['session', 'operation', 'segment'])('keeps a meter and its %s', async (record) => {
      if (record === 'session') {
        const usage = await openUsage({ endTime: new Date() });
        await scope.source.getRepository(ResourceMeteringSession).save({
          id: 'old',
          resourceId: 1,
          usageId: usage.id,
          meterId: 1,
          meterName: 'Energy (kWh)',
          status: ResourceMeteringSessionStatus.Waived,
          creditsPerUnit: 30,
        });
      } else if (record === 'operation') {
        await persistence.store.createOperation({
          id: 'old',
          resourceId: 1,
          meterId: 1,
          sessionId: null,
          kind: 'interim',
          status: 'expired',
          requestedAt: new Date(),
        });
      } else {
        await persistence.store.createSegment({
          id: 'old',
          resourceId: 1,
          meterId: 1,
          status: 'abandoned',
          startedAt: new Date(),
          endedAt: new Date(),
          startValue: '0',
          endValue: null,
          participants: [],
        });
      }
      const before = await counts();
      expect(await deletable()).toBe(false);
      await expect(remove()).rejects.toThrow('METER_HAS_HISTORY');
      expect(await meterRow()).not.toBeNull();
      expect(await counts()).toEqual(before);
      expect(auditedActions()).toEqual([]);
    });
  });

  it('does not find the meter of another resource', async () => {
    await scope.source.getRepository(Resource).save({ id: 2, name: 'Saw', type: ResourceType.Machine });
    for (const action of ['archive', 'restore', 'delete'] as const)
      await expect(removal[action](2, 1, ACTOR)).rejects.toThrow('METER_NOT_FOUND');
    expect(await meterRow()).toMatchObject({ archivedAt: null });
  });
});
