import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource, EntityManager, EntitySchema } from 'typeorm';
import {
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTriggerType,
  ResourceOperatingInterval,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
  UsageDurationUnit,
} from '@attraccess/database-entities';
import { MaintenanceScheduleEvaluatorService } from './maintenance-schedule-evaluator.service';
import {
  ResourceDurationWindow,
  ResourceOperatingAttributionService,
} from '../operating-intervals/resource-operating-attribution.service';
import { MaintenanceSnapshotReader, captureDurationState } from './evaluation/snapshot-reader';
import {
  closeResourceTransactionConnection,
  runSerializedTransaction,
} from '../../database/run-serialized-transaction';

const UsageSchema = new EntitySchema<ResourceUsage>({
  name: 'ResourceUsage',
  target: ResourceUsage,
  tableName: 'usage_snapshot',
  columns: {
    id: { type: Number, primary: true },
    resourceId: { type: Number },
    startTime: { type: 'datetime' },
    endTime: { type: 'datetime', nullable: true },
    lifecyclePending: { type: Boolean, default: false },
    usageAction: { type: String, default: 'usage' },
  },
});
const IntervalSchema = new EntitySchema<ResourceOperatingInterval>({
  name: 'ResourceOperatingInterval',
  target: ResourceOperatingInterval,
  tableName: 'interval_snapshot',
  columns: {
    id: { type: Number, primary: true },
    resourceId: { type: Number },
    startTime: { type: 'datetime' },
    endTime: { type: 'datetime', nullable: true },
  },
});
const AttemptSchema = new EntitySchema<ResourceUsageLifecycleAttempt>({
  name: 'ResourceUsageLifecycleAttempt',
  target: ResourceUsageLifecycleAttempt,
  tableName: 'attempt_snapshot',
  columns: {
    id: { type: String, primary: true },
    resourceId: { type: Number },
    previousUsageId: { type: Number, nullable: true },
    transitionTime: { type: 'datetime' },
    kind: { type: String },
  },
});
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function within<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Operation waited for a stalled duration scan')), 1_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe('Maintenance snapshots (file-backed SQLite)', () => {
  let directory: string;
  let source: DataSource;
  let evaluator: MaintenanceScheduleEvaluatorService;
  let schedule: {
    id: number;
    resourceId: number;
    enabled: boolean;
    triggerType: ResourceMaintenanceScheduleTriggerType;
    usageHoursConfig: { duration: number; unit: UsageDurationUnit };
  };
  let baseline: Date;
  let scanEntered: ReturnType<typeof deferred>;
  let releaseScan: ReturnType<typeof deferred>;
  let notificationReads: Promise<unknown[]>[];
  let durationScan: jest.Mock;
  const startTime = new Date('2020-01-01T00:00:00.000Z');

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'maintenance-snapshot-'));
    source = await new DataSource({
      type: 'sqlite',
      database: join(directory, 'test.sqlite'),
      synchronize: true,
      entities: [UsageSchema, IntervalSchema, AttemptSchema],
    }).initialize();
    await source.query('CREATE TABLE maintenance_probe (resourceId INTEGER PRIMARY KEY)');
    await source.query('CREATE TABLE write_probe (id INTEGER PRIMARY KEY)');
    await source.getRepository(ResourceUsage).insert({ id: 1, resourceId: 1, startTime, endTime: null });
    baseline = startTime;
    schedule = {
      id: 1,
      resourceId: 1,
      enabled: true,
      triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
      usageHoursConfig: { duration: 1, unit: UsageDurationUnit.MINUTES },
    };
    scanEntered = deferred();
    releaseScan = deferred();
    notificationReads = [];
    const schedules = async () => (schedule.enabled ? [structuredClone(schedule)] : []);
    const getRepository = EntityManager.prototype.getRepository;
    jest.spyOn(EntityManager.prototype, 'getRepository').mockImplementation(function (this: EntityManager, target) {
      if (target === ResourceMaintenanceSchedule) return { find: schedules } as never;
      return getRepository.call(this, target) as never;
    });
    const attribution = new ResourceOperatingAttributionService(
      source.getRepository(ResourceOperatingInterval),
      source.getRepository(ResourceUsage),
      source.getRepository(ResourceUsageLifecycleAttempt),
    );
    durationScan = jest.fn(async (windows: ResourceDurationWindow[], now: Date, manager?: EntityManager) => {
      const durations = await attribution.getDurationsForWindows(windows, now, manager);
      // Pause after reading real history but before returning its result. A queued
      // writer can now invalidate that history before maintenance is persisted.
      if (manager) {
        scanEntered.resolve();
        await releaseScan.promise;
      }
      return durations;
    });
    evaluator = new MaintenanceScheduleEvaluatorService(
      { manager: source.manager, existsBy: async () => schedule.enabled, find: schedules } as never,
      { metadata: { tableName: 'maintenance_probe' } } as never,
      { find: async () => [{ id: 1, createdAt: startTime }] } as never,
      { query: async () => [{ resourceId: 1, scheduleId: 1, baseline: startTime }] } as never,
      {
        hasActiveMaintenance: async (resourceId: number, manager: EntityManager) =>
          (await manager.query('SELECT * FROM maintenance_probe WHERE resourceId = ?', [resourceId])).length > 0,
        createMaintenanceFromSchedule: async (
          resourceId: number,
          _scheduleId: number,
          _reason: string,
          manager: EntityManager,
          notify: boolean,
        ) => {
          expect(notify).toBe(false);
          await manager.query('INSERT INTO maintenance_probe VALUES (?)', [resourceId]);
          return { id: resourceId };
        },
        emitScheduledMaintenanceCreated: () => {
          notificationReads.push(source.query('SELECT * FROM maintenance_probe'));
        },
      } as never,
      {} as never,
      { maintenanceUsageQueryWindowDays: { observe: jest.fn() } } as never,
      { getDurationsForWindows: durationScan } as never,
    );
    jest.spyOn(evaluator, 'getBaselineDate').mockImplementation(async () => new Date(baseline.getTime()));
  });

  afterEach(async () => {
    releaseScan.resolve();
    await evaluator.onModuleDestroy();
    await closeResourceTransactionConnection(source);
    await source.destroy();
    jest.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it.each(['resource', 'cron'] as const)('allows usage writes while a %s duration scan is stalled', async (path) => {
    const evaluation = path === 'resource' ? evaluator.evaluateResource(1) : evaluator.evaluateAll();
    try {
      await within(scanEntered.promise);
      await within(
        runSerializedTransaction(source.manager, (manager) => manager.query('INSERT INTO write_probe VALUES (2)')),
      );
      expect(await source.query('SELECT * FROM write_probe')).toEqual([{ id: 2 }]);
      expect(notificationReads).toHaveLength(0);
    } finally {
      releaseScan.resolve();
      await evaluation;
    }
    expect(await Promise.all(notificationReads)).toEqual([[{ resourceId: 1 }]]);
  });

  it('rejects a snapshot when a pending session end finalizes during its duration scan', async () => {
    const evaluation = evaluator.evaluateResource(1);
    try {
      await within(scanEntered.promise);
      await within(
        runSerializedTransaction(source.manager, async (manager) => {
          await manager.getRepository(ResourceUsageLifecycleAttempt).insert({
            id: 'pending-end',
            resourceId: 1,
            previousUsageId: 1,
            kind: 'end',
            transitionTime: new Date('2020-01-01T00:00:30Z'),
          });
          await manager.getRepository(ResourceUsage).update(1, { endTime: new Date('2020-01-01T00:00:30Z') });
          await manager.getRepository(ResourceUsageLifecycleAttempt).delete('pending-end');
        }),
      );
    } finally {
      releaseScan.resolve();
      await evaluation;
    }
    expect(await source.query('SELECT * FROM maintenance_probe')).toEqual([]);
    expect(notificationReads).toHaveLength(0);
  });

  it('rejects an aborted pending-end snapshot and serializes concurrent fresh retries', async () => {
    await source.getRepository(ResourceUsageLifecycleAttempt).insert({
      id: 'aborted-end',
      resourceId: 1,
      previousUsageId: 1,
      kind: 'end',
      transitionTime: new Date('2020-01-01T00:01:30Z'),
    });
    const evaluation = evaluator.evaluateResource(1);
    try {
      await within(scanEntered.promise);
      // Removing an end reservation changes the duration cap even though the
      // usage row itself remains open and unchanged.
      await within(
        runSerializedTransaction(source.manager, (manager) =>
          manager.getRepository(ResourceUsageLifecycleAttempt).delete('aborted-end'),
        ),
      );
    } finally {
      releaseScan.resolve();
      await evaluation;
    }
    expect(await source.query('SELECT * FROM maintenance_probe')).toEqual([]);
    expect(notificationReads).toHaveLength(0);

    // Concurrent retries must re-read the uncapped history, then create only one
    // maintenance after their independent duration scans finish.
    const retries = await Promise.allSettled([
      evaluator.evaluateResource(1),
      evaluator.evaluateResource(1),
      evaluator.evaluateResource(1),
    ]);
    expect(retries).toEqual(Array.from({ length: 3 }, () => ({ status: 'fulfilled', value: undefined })));
    expect(await source.query('SELECT * FROM maintenance_probe')).toEqual([{ resourceId: 1 }]);
    expect(await Promise.all(notificationReads)).toEqual([[{ resourceId: 1 }]]);
  });

  it.each(['configuration', 'disabled', 'baseline'] as const)(
    'rejects a snapshot after its %s changes',
    async (change) => {
      const evaluation = evaluator.evaluateResource(1);
      try {
        await within(scanEntered.promise);
        if (change === 'configuration') schedule.usageHoursConfig.duration = 1_000;
        else if (change === 'disabled') schedule.enabled = false;
        else baseline = new Date();
      } finally {
        releaseScan.resolve();
        await evaluation;
      }
      expect(await source.query('SELECT * FROM maintenance_probe')).toEqual([]);
      expect(notificationReads).toHaveLength(0);
    },
  );

  it('waits for an active scan during shutdown and rejects new evaluations', async () => {
    const evaluation = evaluator.evaluateResource(1);
    await within(scanEntered.promise);
    let stopped = false;
    const shutdown = evaluator.onModuleDestroy().then(() => {
      stopped = true;
    });
    try {
      await evaluator.evaluateResource(1);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(stopped).toBe(false);
      expect(durationScan).toHaveBeenCalledTimes(1);
    } finally {
      releaseScan.resolve();
      await Promise.all([evaluation, shutdown]);
    }
    expect(stopped).toBe(true);
  });

  it('reads committed usage state independently of a main-connection transaction that rolls back', async () => {
    const reader = new MaintenanceSnapshotReader(source);
    try {
      const manager = await reader.manager();
      const committed = await captureDurationState(1, manager);
      await expect(
        source.transaction(async (main) => {
          await main.getRepository(ResourceUsage).update(1, { endTime: new Date('2020-01-01T00:00:30Z') });
          expect(await captureDurationState(1, main)).not.toBe(committed);
          expect(await captureDurationState(1, manager)).toBe(committed);
          throw new Error('Rollback unrelated transaction');
        }),
      ).rejects.toThrow('Rollback unrelated transaction');
      expect(await captureDurationState(1, manager)).toBe(committed);
    } finally {
      await reader.close();
    }
  });
});
