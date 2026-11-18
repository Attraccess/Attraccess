import { ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { OperatingIntervalRecord } from '@attraccess/application-models';
import { OperatingMetricsRecorder } from '../../metrics/instrumentation/operating/operating.helper';
import { OperatingClockRegressionError, OperatingTimelineStore } from './operating-timeline.port';
import { ResourceOperatingIntervalService } from './resource-operating-interval.service';

const interval = (resourceId: number, startTime: Date): OperatingIntervalRecord => ({
  id: 1,
  resourceId,
  startTime,
  endTime: null,
  startFlowNodeId: null,
  startFlowRunId: null,
  endFlowNodeId: null,
  endFlowRunId: null,
});

/** The storing side is a fake: what it records is verified against a real database in the persistence spec. */
describe('ResourceOperatingIntervalService', () => {
  let timeline: { recordTransition: jest.Mock };
  let operatingMetrics: jest.Mocked<OperatingMetricsRecorder>;
  let eventEmitter: EventEmitter2;
  let service: ResourceOperatingIntervalService;

  beforeEach(() => {
    timeline = { recordTransition: jest.fn() };
    operatingMetrics = {
      recordTransition: jest.fn(),
      setResourceState: jest.fn(),
      recordDataQualityFailures: jest.fn(),
    };
    eventEmitter = new EventEmitter2();
    service = new ResourceOperatingIntervalService(
      timeline as unknown as OperatingTimelineStore,
      operatingMetrics,
      eventEmitter,
    );
  });

  it('hands the transition and its provenance to the store and returns what it recorded', async () => {
    const recorded = interval(3, new Date('2026-08-27T12:34:56.789Z'));
    timeline.recordTransition.mockResolvedValue(recorded);

    await expect(service.transition(3, 'operating', { flowNodeId: 'node', flowRunId: 'run' })).resolves.toBe(recorded);

    expect(timeline.recordTransition).toHaveBeenCalledWith(3, 'operating', { flowNodeId: 'node', flowRunId: 'run' });
  });

  it('ignores an idle transition of a resource that is not operating', async () => {
    timeline.recordTransition.mockResolvedValue(null);
    const changed = jest.fn();
    eventEmitter.on('resource.operating.state.changed', changed);

    await expect(service.transition(1, 'idle')).resolves.toBeNull();

    expect(changed).not.toHaveBeenCalled();
  });

  it('publishes state changes only after the store committed the transition', async () => {
    let commit!: () => void;
    timeline.recordTransition.mockImplementationOnce(
      () => new Promise((resolve) => (commit = () => resolve(interval(3, new Date())))),
    );
    timeline.recordTransition.mockResolvedValue(null);
    const changed = jest.fn();
    eventEmitter.on('resource.operating.state.changed', changed);

    const transition = service.transition(3, 'operating');
    await new Promise((resolve) => setImmediate(resolve));
    expect(changed).not.toHaveBeenCalled();
    commit();
    await transition;

    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ resourceId: 3, state: 'operating' }));
    await service.transition(3, 'operating');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('does not publish an uncommitted transition or update its metrics', async () => {
    timeline.recordTransition.mockRejectedValueOnce(new Error('commit failed'));
    const changed = jest.fn();
    eventEmitter.on('resource.operating.state.changed', changed);

    await expect(service.transition(3, 'operating')).rejects.toThrow('commit failed');

    expect(changed).not.toHaveBeenCalled();
    expect(operatingMetrics.recordTransition).not.toHaveBeenCalled();
  });

  it('answers a clock regression with a conflict and leaves metrics and events alone', async () => {
    timeline.recordTransition.mockRejectedValueOnce(new OperatingClockRegressionError());
    const changed = jest.fn();
    eventEmitter.on('resource.operating.state.changed', changed);

    const result = service.transition(9, 'idle');

    await expect(result).rejects.toThrow(ConflictException);
    await expect(result).rejects.toThrow('Server clock precedes the last operating transition');
    expect(changed).not.toHaveBeenCalled();
    expect(operatingMetrics.recordTransition).not.toHaveBeenCalled();
  });

  it('serializes transitions of the same resource in arrival order, and lets other resources pass', async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    timeline.recordTransition.mockImplementation(async (resourceId: number, state: string) => {
      order.push(`${resourceId}:${state}:start`);
      if (resourceId === 3 && state === 'operating') await new Promise<void>((resolve) => (releaseFirst = resolve));
      order.push(`${resourceId}:${state}:end`);
      return null;
    });

    const first = service.transition(3, 'operating');
    const second = service.transition(3, 'idle');
    const other = service.transition(4, 'operating');
    await other;
    expect(order).toEqual(['3:operating:start', '4:operating:start', '4:operating:end']);
    releaseFirst();
    await Promise.all([first, second]);

    expect(order.slice(3)).toEqual(['3:operating:end', '3:idle:start', '3:idle:end']);
  });

  it('records applied transitions and the resulting state for observability', async () => {
    timeline.recordTransition.mockResolvedValue(interval(3, new Date()));

    await service.transition(3, 'operating');

    expect(operatingMetrics.recordTransition).toHaveBeenCalledWith('operating', true);
    expect(operatingMetrics.setResourceState).toHaveBeenCalledWith(3, 'operating');
  });

  it('records duplicate transitions as noop while the state still reflects the signal', async () => {
    timeline.recordTransition.mockResolvedValueOnce(interval(3, new Date())).mockResolvedValueOnce(null);

    await service.transition(3, 'operating');
    await service.transition(3, 'operating');

    expect(operatingMetrics.recordTransition).toHaveBeenNthCalledWith(2, 'operating', false);
    expect(operatingMetrics.setResourceState).toHaveBeenNthCalledWith(2, 3, 'operating');
  });
});
