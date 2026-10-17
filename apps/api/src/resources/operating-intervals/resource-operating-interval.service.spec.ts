import { ResourceOperatingInterval } from '@attraccess/database-entities';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { OperatingMetricsRecorder } from '../../metrics/instrumentation/operating/operating.helper';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceOperatingIntervalService } from './resource-operating-interval.service';

describe('ResourceOperatingIntervalService', () => {
  let openInterval: ResourceOperatingInterval | null;
  let latestInterval: ResourceOperatingInterval | null;
  let repository: jest.Mocked<Pick<Repository<ResourceOperatingInterval>, 'findOne' | 'create' | 'save'>>;
  let operatingMetrics: jest.Mocked<OperatingMetricsRecorder>;
  let service: ResourceOperatingIntervalService;
  let eventEmitter: EventEmitter2;
  let transaction: jest.Mock;

  beforeEach(() => {
    openInterval = null;
    latestInterval = null;
    operatingMetrics = {
      recordTransition: jest.fn(),
      setResourceState: jest.fn(),
      recordDataQualityFailures: jest.fn(),
    };
    repository = {
      findOne: jest.fn(async () => openInterval ?? latestInterval),
      create: jest.fn((value) => value as ResourceOperatingInterval),
      save: jest.fn(async (interval) => {
        latestInterval = interval;
        openInterval = interval.endTime === null ? interval : null;
        return interval;
      }),
    };
    transaction = jest.fn((callback) => callback(manager));
    const manager = {
      getRepository: jest.fn(() => repository),
      transaction,
      query: jest.fn(),
    } as unknown as EntityManager;
    eventEmitter = new EventEmitter2();
    service = new ResourceOperatingIntervalService(
      { manager } as Repository<ResourceOperatingInterval>,
      operatingMetrics,
      eventEmitter,
    );
  });

  afterEach(() => jest.useRealTimers());

  it('starts idle and ignores an idle transition', async () => {
    await expect(service.transition(1, 'idle')).resolves.toBeNull();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('creates an open interval at the server timestamp with millisecond precision', async () => {
    const now = new Date('2026-08-27T12:34:56.789Z');
    jest.useFakeTimers().setSystemTime(now);

    await service.transition(3, 'operating');

    expect(repository.create).toHaveBeenCalledWith({
      resourceId: 3,
      startTime: now,
      endTime: null,
      startFlowNodeId: null,
      startFlowRunId: null,
      endFlowNodeId: null,
      endFlowRunId: null,
    });
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('publishes state changes only after its transaction commits', async () => {
    let finishCommit: () => void;
    let finishWrite: () => void;
    const written = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    const commit = new Promise<void>((resolve) => {
      finishCommit = resolve;
    });
    const executeTransaction = transaction.getMockImplementation();
    transaction.mockImplementation(async (callback) => {
      const result = await executeTransaction(callback);
      finishWrite();
      await commit;
      return result;
    });
    const changed = jest.fn();
    eventEmitter.on('resource.operating.state.changed', changed);

    const transition = service.transition(3, 'operating');
    await written;
    expect(changed).not.toHaveBeenCalled();
    finishCommit();
    await transition;

    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ resourceId: 3, state: 'operating' }));
    await service.transition(3, 'operating');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('does not publish an uncommitted transition or update its metrics', async () => {
    transaction.mockRejectedValueOnce(new Error('commit failed'));
    const changed = jest.fn();
    eventEmitter.on('resource.operating.state.changed', changed);

    await expect(service.transition(3, 'operating')).rejects.toThrow('commit failed');

    expect(changed).not.toHaveBeenCalled();
    expect(operatingMetrics.recordTransition).not.toHaveBeenCalled();
  });

  it('is idempotent for duplicate operating transitions', async () => {
    await service.transition(3, 'operating');
    await service.transition(3, 'operating');

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('closes a persisted open interval without requiring a usage session', async () => {
    openInterval = {
      id: 4,
      resourceId: 9,
      startTime: new Date('2026-08-27T12:00:00.000Z'),
      endTime: null,
    } as ResourceOperatingInterval;
    const now = new Date('2026-08-27T12:34:56.789Z');
    jest.useFakeTimers().setSystemTime(now);

    await service.transition(9, 'idle');

    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ endTime: now }));
  });

  it('rejects an idle transition before the persisted operating boundary without changing state', async () => {
    openInterval = {
      id: 4,
      resourceId: 9,
      startTime: new Date('2026-08-27T12:00:00.001Z'),
      endTime: null,
    } as ResourceOperatingInterval;
    jest.useFakeTimers().setSystemTime(new Date('2026-08-27T12:00:00.000Z'));

    await expect(service.transition(9, 'idle')).rejects.toThrow('Server clock precedes the last operating transition');

    expect(openInterval.endTime).toBeNull();
    expect(repository.save).not.toHaveBeenCalled();
    expect(operatingMetrics.recordTransition).not.toHaveBeenCalled();
  });

  it.each(['idle', 'operating'] as const)(
    'rejects %s before a persisted idle boundary and accepts it once the clock catches up',
    async (state) => {
      latestInterval = {
        id: 4,
        resourceId: 9,
        startTime: new Date('2026-08-27T12:00:00.000Z'),
        endTime: new Date('2026-08-27T12:10:00.001Z'),
      } as ResourceOperatingInterval;
      jest.useFakeTimers().setSystemTime(new Date('2026-08-27T12:10:00.000Z'));

      await expect(service.transition(9, state)).rejects.toThrow('Server clock precedes the last operating transition');
      expect(repository.save).not.toHaveBeenCalled();

      jest.setSystemTime(new Date('2026-08-27T12:10:00.001Z'));
      const result = await service.transition(9, state);
      if (state === 'operating') {
        expect(result.startTime).toEqual(new Date('2026-08-27T12:10:00.001Z'));
      } else {
        expect(result).toBeNull();
      }
    },
  );

  it('retains the accepted flow provenance on both boundaries and ignores duplicate provenance', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-27T12:00:00.000Z'));
    const start = await service.transition(9, 'operating', { flowNodeId: 'start-node', flowRunId: 'start-run' });
    await service.transition(9, 'operating', { flowNodeId: 'duplicate-node', flowRunId: 'duplicate-run' });

    expect(start).toMatchObject({
      startFlowNodeId: 'start-node',
      startFlowRunId: 'start-run',
      endFlowNodeId: null,
      endFlowRunId: null,
    });

    jest.setSystemTime(new Date('2026-08-27T12:10:00.000Z'));
    const end = await service.transition(9, 'idle', { flowNodeId: 'stop-node', flowRunId: 'stop-run' });
    await service.transition(9, 'idle', { flowNodeId: 'duplicate-stop', flowRunId: 'duplicate-run' });

    expect(end).toMatchObject({
      startFlowNodeId: 'start-node',
      startFlowRunId: 'start-run',
      endFlowNodeId: 'stop-node',
      endFlowRunId: 'stop-run',
    });
  });

  it('serializes conflicting transitions for the same resource in arrival order', async () => {
    await Promise.all([service.transition(3, 'operating'), service.transition(3, 'idle')]);

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledTimes(2);
    expect(openInterval).toBeNull();
  });

  it('can close an interval opened before the service instance started', async () => {
    openInterval = {
      id: 4,
      resourceId: 9,
      startTime: new Date('2026-08-27T12:00:00.000Z'),
      endTime: null,
    } as ResourceOperatingInterval;

    await service.transition(9, 'idle');

    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('treats an open-interval unique conflict as a duplicate operating transition', async () => {
    repository.save.mockRejectedValueOnce(
      Object.assign(new QueryFailedError('', [], new Error('UNIQUE constraint failed')), { code: 'SQLITE_CONSTRAINT' }),
    );

    await expect(service.transition(3, 'operating')).resolves.toBeNull();
  });

  it('records applied transitions and the resulting state for observability', async () => {
    await service.transition(3, 'operating');

    expect(operatingMetrics.recordTransition).toHaveBeenCalledWith('operating', true);
    expect(operatingMetrics.setResourceState).toHaveBeenCalledWith(3, 'operating');
  });

  it('records duplicate transitions as noop while the state still reflects the signal', async () => {
    await service.transition(3, 'operating');
    await service.transition(3, 'operating');

    expect(operatingMetrics.recordTransition).toHaveBeenNthCalledWith(2, 'operating', false);
    expect(operatingMetrics.setResourceState).toHaveBeenNthCalledWith(2, 3, 'operating');
  });
});
