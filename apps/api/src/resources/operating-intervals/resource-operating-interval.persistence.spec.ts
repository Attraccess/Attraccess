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
import { closeResourceTransactionConnection } from '../../database/run-serialized-transaction';
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

describe('Operating interval persistence', () => {
  let directory: string;
  let source: DataSource;
  let service: ResourceOperatingIntervalService;
  let eventEmitter: EventEmitter2;
  const metrics = {
    recordTransition: jest.fn(),
    setResourceState: jest.fn(),
    recordDataQualityFailures: jest.fn(),
  } as unknown as OperatingMetricsRecorder;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'attraccess-operating-'));
    source = await new DataSource({
      type: 'sqlite',
      database: join(directory, 'test.sqlite'),
      entities: [IntervalSchema],
    }).initialize();
    await source.query('CREATE TABLE resource (id integer PRIMARY KEY)');
    await source.query('INSERT INTO resource (id) VALUES (1)');
    const runner = source.createQueryRunner();
    await new ResourceOperatingInterval1783500000000().up(runner);
    await new OperatingTransitionProvenance1784300000000().up(runner);
    await runner.release();
    eventEmitter = new EventEmitter2();
    service = new ResourceOperatingIntervalService(
      source.getRepository(ResourceOperatingInterval),
      metrics,
      eventEmitter,
    );
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

    expect(await source.getRepository(ResourceOperatingInterval).find()).toEqual([
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
    service = new ResourceOperatingIntervalService(
      source.getRepository(ResourceOperatingInterval),
      metrics,
      eventEmitter,
    );
    jest.setSystemTime(new Date('2026-09-19T12:00:00.122Z'));
    await expect(service.transition(1, 'idle')).rejects.toThrow('Server clock precedes the last operating transition');
    jest.setSystemTime(new Date('2026-09-19T12:01:00.456Z'));
    await service.transition(1, 'idle', { flowNodeId: 'stop-node', flowRunId: 'stop-run' });
    service = new ResourceOperatingIntervalService(
      source.getRepository(ResourceOperatingInterval),
      metrics,
      eventEmitter,
    );
    jest.setSystemTime(new Date('2026-09-19T12:01:00.455Z'));
    await expect(service.transition(1, 'operating')).rejects.toThrow(
      'Server clock precedes the last operating transition',
    );

    expect(await source.getRepository(ResourceOperatingInterval).find()).toEqual([
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
});
