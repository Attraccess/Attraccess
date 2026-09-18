import { ResourceOperatingInterval } from '@attraccess/database-entities';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { OperatingMetricsRecorder } from '../../metrics/instrumentation/operating/operating.helper';
import { ResourceOperatingIntervalService } from './resource-operating-interval.service';

describe('ResourceOperatingIntervalService', () => {
  let openInterval: ResourceOperatingInterval | null;
  let repository: jest.Mocked<Pick<Repository<ResourceOperatingInterval>, 'findOne' | 'create' | 'save'>>;
  let operatingMetrics: jest.Mocked<OperatingMetricsRecorder>;
  let service: ResourceOperatingIntervalService;

  beforeEach(() => {
    openInterval = null;
    operatingMetrics = {
      recordTransition: jest.fn(),
      setResourceState: jest.fn(),
      recordDataQualityFailures: jest.fn(),
    };
    repository = {
      findOne: jest.fn(async () => openInterval),
      create: jest.fn((value) => value as ResourceOperatingInterval),
      save: jest.fn(async (interval) => {
        openInterval = interval.endTime === null ? interval : null;
        return interval;
      }),
    };
    const manager = {
      getRepository: jest.fn(() => repository),
      transaction: jest.fn((callback) => callback(manager)),
      query: jest.fn(),
    } as unknown as EntityManager;
    service = new ResourceOperatingIntervalService(
      { manager } as Repository<ResourceOperatingInterval>,
      operatingMetrics,
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

    expect(repository.create).toHaveBeenCalledWith({ resourceId: 3, startTime: now, endTime: null });
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('uses a supplied transaction manager without starting a nested transaction', async () => {
    const manager = {
      getRepository: jest.fn(() => repository),
      query: jest.fn(),
      transaction: jest.fn(),
    } as unknown as EntityManager;

    await service.transition(3, 'operating', manager);

    expect(manager.transaction).not.toHaveBeenCalled();
    expect(manager.query).toHaveBeenCalledWith('UPDATE "resource" SET "id" = "id" WHERE "id" = ?', [3]);
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
