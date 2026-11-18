import { ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceOperatingInterval } from '@attraccess/database-entities';
import { DataSource, EntitySchema } from 'typeorm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ResourceOperatingIntervalService } from './resource-operating-interval.service';
import { OperatingMetricsRecorder } from '../../metrics/instrumentation/operating/operating.helper';
import { ResourceOperatingInterval1783500000000 } from '../../database/migrations/1783500000000-resource-operating-interval';
import { OperatingTransitionProvenance1784300000000 } from '../../database/migrations/1784300000000-operating-transition-provenance';
import { EntityManagerResolver } from '../../database/adapters/entity-manager-resolver';
import { TypeOrmOperatingTimelineStore } from '../../database/adapters/operating-intervals/typeorm-operating-timeline.store';
import { resolveDatabaseBackend } from '../../database/backend';
import { closeResourceTransactionConnection } from '../../database/sqlite/run-serialized-transaction';
import { createSqliteUnitOfWork } from '../../database/sqlite/sqlite-unit-of-work';
import { ResourceOperatingStateChangedEvent } from './events/resource-operating-state-changed.event';

const IntervalSchema = new EntitySchema<ResourceOperatingInterval>({
  name: 'ResourceOperatingInterval',
  target: ResourceOperatingInterval,
  tableName: 'resource_operating_interval',
  columns: {
    id: { type: Number, primary: true, generated: true },
    resourceId: { type: Number },
    startTime: { type: 'datetime' },
    endTime: { type: 'datetime', nullable: true },
    startFlowNodeId: { type: String, nullable: true },
    startFlowRunId: { type: String, nullable: true },
    endFlowNodeId: { type: String, nullable: true },
    endFlowRunId: { type: String, nullable: true },
  },
});

const metrics = {
  recordTransition: jest.fn(),
  setResourceState: jest.fn(),
  recordDataQualityFailures: jest.fn(),
} as unknown as OperatingMetricsRecorder;

/** One connection of the application to the file, with the service on top of its operating timeline adapter. */
function serviceOn(source: DataSource, eventEmitter: EventEmitter2): ResourceOperatingIntervalService {
  const unitOfWork = createSqliteUnitOfWork(source);
  const store = new TypeOrmOperatingTimelineStore(unitOfWork, new EntityManagerResolver(unitOfWork, source));
  return new ResourceOperatingIntervalService(store, metrics, eventEmitter);
}

describe('Operating interval persistence', () => {
  let directory: string;
  let source: DataSource;
  let service: ResourceOperatingIntervalService;
  let eventEmitter: EventEmitter2;
  const intervals = () => source.getRepository(ResourceOperatingInterval).find({ order: { id: 'ASC' } });

  beforeEach(async () => {
    resolveDatabaseBackend();
    directory = await mkdtemp(join(tmpdir(), 'attraccess-operating-'));
    source = await new DataSource({
      type: 'better-sqlite3',
      invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
      database: join(directory, 'test.sqlite'),
      entities: [IntervalSchema],
    }).initialize();
    await source.query('CREATE TABLE resource (id integer PRIMARY KEY)');
    await source.query('INSERT INTO resource (id) VALUES (1), (9)');
    const runner = source.createQueryRunner();
    await new ResourceOperatingInterval1783500000000().up(runner);
    await new OperatingTransitionProvenance1784300000000().up(runner);
    await runner.release();
    eventEmitter = new EventEmitter2();
    service = serviceOn(source, eventEmitter);
  });

  afterEach(async () => {
    jest.useRealTimers();
    await closeResourceTransactionConnection(source);
    await source.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  it('keeps an accepted observation when an unrelated application transaction rolls back', async () => {
    const changed = jest.fn();
    eventEmitter.on(ResourceOperatingStateChangedEvent.EVENT_NAME, changed);

    await expect(
      source.transaction(async () => {
        await service.transition(1, 'operating', { flowNodeId: 'sensor-node', flowRunId: 'sensor-run' });
        throw new Error('unrelated transaction failed');
      }),
    ).rejects.toThrow('unrelated transaction failed');

    expect(await intervals()).toEqual([
      expect.objectContaining({
        resourceId: 1,
        endTime: null,
        startFlowNodeId: 'sensor-node',
        startFlowRunId: 'sensor-run',
      }),
    ]);
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ resourceId: 1, state: 'operating' }));
  });

  it('preserves millisecond boundaries and provenance across service restarts and rejects clock regression', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(new Date('2026-09-19T12:00:00.123Z'));
    await service.transition(1, 'operating', { flowNodeId: 'start-node', flowRunId: 'start-run' });
    service = serviceOn(source, eventEmitter);
    jest.setSystemTime(new Date('2026-09-19T12:00:00.122Z'));
    await expect(service.transition(1, 'idle')).rejects.toThrow('Server clock precedes the last operating transition');
    jest.setSystemTime(new Date('2026-09-19T12:01:00.456Z'));
    await service.transition(1, 'idle', { flowNodeId: 'stop-node', flowRunId: 'stop-run' });
    service = serviceOn(source, eventEmitter);
    jest.setSystemTime(new Date('2026-09-19T12:01:00.455Z'));
    await expect(service.transition(1, 'operating')).rejects.toThrow(
      'Server clock precedes the last operating transition',
    );

    expect(await intervals()).toEqual([
      expect.objectContaining({
        startTime: new Date('2026-09-19T12:00:00.123Z'),
        endTime: new Date('2026-09-19T12:01:00.456Z'),
        startFlowNodeId: 'start-node',
        startFlowRunId: 'start-run',
        endFlowNodeId: 'stop-node',
        endFlowRunId: 'stop-run',
      }),
    ]);
  });

  it('answers a clock regression with a conflict and records nothing', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(new Date('2026-08-27T12:00:00.001Z'));
    await service.transition(9, 'operating');
    jest.setSystemTime(new Date('2026-08-27T12:00:00.000Z'));

    await expect(service.transition(9, 'idle')).rejects.toThrow(ConflictException);

    expect(await intervals()).toEqual([expect.objectContaining({ resourceId: 9, endTime: null })]);
  });

  it('starts idle, ignores an idle transition and records an operating one with its provenance once', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(new Date('2026-08-27T12:00:00.000Z'));
    await expect(service.transition(9, 'idle')).resolves.toBeNull();
    const start = await service.transition(9, 'operating', { flowNodeId: 'start-node', flowRunId: 'start-run' });
    await expect(
      service.transition(9, 'operating', { flowNodeId: 'duplicate-node', flowRunId: 'duplicate-run' }),
    ).resolves.toBeNull();

    expect(start).toMatchObject({
      startTime: new Date('2026-08-27T12:00:00.000Z'),
      startFlowNodeId: 'start-node',
      startFlowRunId: 'start-run',
      endFlowNodeId: null,
      endFlowRunId: null,
    });

    jest.setSystemTime(new Date('2026-08-27T12:10:00.000Z'));
    const end = await service.transition(9, 'idle', { flowNodeId: 'stop-node', flowRunId: 'stop-run' });
    await expect(
      service.transition(9, 'idle', { flowNodeId: 'duplicate-stop', flowRunId: 'duplicate-run' }),
    ).resolves.toBeNull();

    expect(end).toMatchObject({
      startFlowNodeId: 'start-node',
      endFlowNodeId: 'stop-node',
      endFlowRunId: 'stop-run',
      endTime: new Date('2026-08-27T12:10:00.000Z'),
    });
    expect(await intervals()).toHaveLength(1);
  });

  it('closes an interval opened by an earlier instance and rejects an idle before its start', async () => {
    await source.query(
      `INSERT INTO resource_operating_interval (resourceId, startTime) VALUES (9, '2026-08-27 12:00:00.001')`,
    );
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(new Date('2026-08-27T12:00:00.000Z'));

    await expect(service.transition(9, 'idle')).rejects.toThrow('Server clock precedes the last operating transition');
    expect((await intervals())[0].endTime).toBeNull();

    jest.setSystemTime(new Date('2026-08-27T12:34:56.789Z'));
    await service.transition(9, 'idle');
    expect((await intervals())[0].endTime).toEqual(new Date('2026-08-27T12:34:56.789Z'));
  });

  it.each(['idle', 'operating'] as const)(
    'rejects %s before a persisted idle boundary and accepts it once the clock catches up',
    async (state) => {
      await source.query(
        `INSERT INTO resource_operating_interval (resourceId, startTime, endTime)
         VALUES (9, '2026-08-27 12:00:00.000', '2026-08-27 12:10:00.001')`,
      );
      jest
        .useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
        .setSystemTime(new Date('2026-08-27T12:10:00.000Z'));

      await expect(service.transition(9, state)).rejects.toThrow('Server clock precedes the last operating transition');
      expect(await intervals()).toHaveLength(1);

      jest.setSystemTime(new Date('2026-08-27T12:10:00.001Z'));
      const result = await service.transition(9, state);
      if (state === 'operating') expect(result?.startTime).toEqual(new Date('2026-08-27T12:10:00.001Z'));
      else expect(result).toBeNull();
    },
  );

  it('serializes conflicting transitions of one resource in arrival order', async () => {
    await Promise.all([service.transition(1, 'operating'), service.transition(1, 'idle')]);

    expect(await intervals()).toEqual([expect.objectContaining({ resourceId: 1, endTime: expect.any(Date) })]);
  });

  describe('two independent connections to the same file', () => {
    let other: DataSource;
    let otherService: ResourceOperatingIntervalService;

    beforeEach(async () => {
      other = await resolveDatabaseBackend()
        .createDataSource({
          type: 'better-sqlite3',
          invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
          database: source.options.database as string,
          entities: [IntervalSchema],
        })
        .initialize();
      otherService = serviceOn(other, new EventEmitter2());
    });

    afterEach(async () => {
      await closeResourceTransactionConnection(other);
      await other.destroy();
    });

    it('never creates a second open interval when both race to start the same resource', async () => {
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, index) => (index % 2 ? service : otherService).transition(1, 'operating')),
      );

      expect(results.filter((result) => result !== null)).toHaveLength(1);
      const rows = await intervals();
      expect(rows).toHaveLength(1);
      expect(rows[0].endTime).toBeNull();
    });

    it('keeps one consistent timeline per resource while other resources transition at the same time', async () => {
      await Promise.all(
        [1, 9].flatMap((resourceId) =>
          ['operating', 'idle', 'operating', 'idle'].map((state, index) =>
            (index % 2 ? service : otherService).transition(resourceId, state as 'operating' | 'idle'),
          ),
        ),
      );

      for (const resourceId of [1, 9]) {
        const rows = (await intervals()).filter((row) => row.resourceId === resourceId);
        expect(rows.filter((row) => row.endTime === null).length).toBeLessThanOrEqual(1);
        rows.forEach((row) => expect(row.endTime === null || row.endTime >= row.startTime).toBe(true));
        // Chronological: an interval never starts before the previous one ended.
        rows.slice(1).forEach((row, index) => expect(rows[index].endTime).not.toBeNull());
      }
    });
  });
});
