import { ResourceFlowNode, ResourceOperatingInterval } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { OperatingMetricsRecorder } from '../../metrics/instrumentation/operating/operating.helper';
import {
  ResourceOperatingAttributionService,
  ResourceOperatingAttributionSummary,
} from './resource-operating-attribution.service';
import { ResourceOperatingDiagnosticsService, unionDurationMs } from './resource-operating-diagnostics.service';

const at = (day: number, time: string) => new Date(`2026-09-${String(day).padStart(2, '0')}T${time}.000Z`);

const interval = (id: number, startTime: Date, endTime: Date | null): ResourceOperatingInterval =>
  ({ id, resourceId: 1, startTime, endTime }) as ResourceOperatingInterval;

function summary(overrides: Partial<ResourceOperatingAttributionSummary> = {}): ResourceOperatingAttributionSummary {
  return {
    asOf: at(20, '12:00:00'),
    windowStart: at(1, '00:00:00'),
    sessionDurationMs: 0,
    operatingDataAvailable: true,
    operatingDurationMs: 0,
    attributedOperatingDurationMs: 0,
    unattributedOperatingDurationMs: 0,
    isOperating: false,
    isProvisional: false,
    attributions: [],
    ...overrides,
  };
}

describe('ResourceOperatingDiagnosticsService', () => {
  let intervalRepository: jest.Mocked<
    Pick<Repository<ResourceOperatingInterval>, 'findOne' | 'find' | 'findAndCount' | 'count'>
  >;
  let flowNodeRepository: jest.Mocked<Pick<Repository<ResourceFlowNode>, 'count'>>;
  let attributionService: jest.Mocked<Pick<ResourceOperatingAttributionService, 'getForResource'>>;
  let operatingMetrics: jest.Mocked<OperatingMetricsRecorder>;
  let service: ResourceOperatingDiagnosticsService;

  beforeEach(() => {
    intervalRepository = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      count: jest.fn().mockResolvedValue(0),
    };
    flowNodeRepository = { count: jest.fn().mockResolvedValue(0) };
    attributionService = { getForResource: jest.fn().mockResolvedValue(summary()) };
    operatingMetrics = {
      recordTransition: jest.fn(),
      setResourceState: jest.fn(),
      recordDataQualityFailures: jest.fn(),
    };
    service = new ResourceOperatingDiagnosticsService(
      intervalRepository as unknown as Repository<ResourceOperatingInterval>,
      flowNodeRepository as unknown as Repository<ResourceFlowNode>,
      attributionService as unknown as ResourceOperatingAttributionService,
      operatingMetrics,
    );
  });

  describe('getCurrentState', () => {
    it('reports operating with the open interval when one exists', async () => {
      const open = interval(5, at(18, '08:00:00'), null);
      intervalRepository.findOne.mockResolvedValueOnce(open).mockResolvedValueOnce(open);

      const state = await service.getCurrentState(1);

      expect(state).toEqual({
        state: 'operating',
        openInterval: { id: 5, startTime: at(18, '08:00:00') },
        lastTransitionAt: at(18, '08:00:00'),
      });
    });

    it('reports idle with the last closed transition when no interval is open', async () => {
      const closed = interval(4, at(17, '08:00:00'), at(17, '10:30:00'));
      intervalRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(closed);

      const state = await service.getCurrentState(1);

      expect(state).toEqual({
        state: 'idle',
        openInterval: null,
        lastTransitionAt: at(17, '10:30:00'),
      });
    });

    it('reports idle without a last transition for a resource that never operated', async () => {
      intervalRepository.findOne.mockResolvedValue(null);

      await expect(service.getCurrentState(1)).resolves.toEqual({
        state: 'idle',
        openInterval: null,
        lastTransitionAt: null,
      });
    });
  });

  describe('getTransitionHistory', () => {
    it('exposes recorded provenance for each boundary and leaves legacy provenance unknown', async () => {
      intervalRepository.findAndCount.mockResolvedValue([
        [
          {
            ...interval(2, at(12, '09:00:00'), at(12, '11:00:00')),
            startFlowNodeId: 'start-node',
            startFlowRunId: 'start-run',
            endFlowNodeId: 'stop-node',
            endFlowRunId: 'stop-run',
          },
          interval(1, at(10, '08:00:00'), null),
        ],
        2,
      ]);

      const page = await service.getTransitionHistory(1, 1, 20);

      expect(page.items.map(({ state, flowNodeId, flowRunId }) => ({ state, flowNodeId, flowRunId }))).toEqual([
        { state: 'idle', flowNodeId: 'stop-node', flowRunId: 'stop-run' },
        { state: 'operating', flowNodeId: 'start-node', flowRunId: 'start-run' },
        { state: 'operating', flowNodeId: null, flowRunId: null },
      ]);
    });

    it('derives descending transitions from interval rows and paginates over rows', async () => {
      intervalRepository.findAndCount.mockResolvedValue([
        [interval(2, at(12, '09:00:00'), at(12, '11:00:00')), interval(1, at(10, '08:00:00'), null)],
        2,
      ]);

      const page = await service.getTransitionHistory(1, 1, 20);

      expect(page.totalIntervals).toBe(2);
      expect(page.items.map((item) => [item.timestamp.toISOString(), item.state, item.intervalId])).toEqual([
        [at(12, '11:00:00').toISOString(), 'idle', 2],
        [at(12, '09:00:00').toISOString(), 'operating', 2],
        [at(10, '08:00:00').toISOString(), 'operating', 1],
      ]);
      expect(page.items.every((item) => item.source === 'flow-signal')).toBe(true);
      expect(intervalRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20, order: { startTime: 'DESC' } }),
      );
    });

    it('skips interval rows for later pages', async () => {
      await service.getTransitionHistory(1, 3, 5);

      expect(intervalRepository.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 5 }));
    });
  });

  describe('getDataQualityReport', () => {
    it('reports a clean timeline without issues', async () => {
      flowNodeRepository.count.mockResolvedValue(2);
      intervalRepository.find.mockResolvedValue([interval(1, at(18, '08:00:00'), at(18, '10:00:00'))]);

      const report = await service.getDataQualityReport(1, at(20, '00:00:00'));

      expect(report.trackingConfigured).toBe(true);
      expect(report.issues).toEqual([]);
      expect(operatingMetrics.recordDataQualityFailures).not.toHaveBeenCalled();
    });

    it('flags tracking configured but no signal in the window', async () => {
      flowNodeRepository.count.mockResolvedValue(1);
      intervalRepository.find.mockResolvedValue([]);
      intervalRepository.count.mockResolvedValue(0);

      const report = await service.getDataQualityReport(1, at(20, '00:00:00'));

      expect(report.issues).toEqual([expect.objectContaining({ kind: 'stale-signal', count: 1 })]);
      expect(operatingMetrics.recordDataQualityFailures).toHaveBeenCalledWith('stale-signal', 1);
    });

    it('does not flag a long-running open interval as stale', async () => {
      flowNodeRepository.count.mockResolvedValue(1);
      intervalRepository.find.mockResolvedValue([]);
      intervalRepository.count.mockResolvedValue(1);

      const report = await service.getDataQualityReport(1, at(20, '00:00:00'));

      expect(report.issues).toEqual([]);
    });

    it('flags overlapping intervals as out-of-order transitions', async () => {
      intervalRepository.find.mockResolvedValue([
        interval(1, at(18, '08:00:00'), at(18, '12:00:00')),
        interval(2, at(18, '10:00:00'), at(18, '14:00:00')),
      ]);

      const report = await service.getDataQualityReport(1, at(20, '00:00:00'));

      expect(report.issues).toEqual([
        expect.objectContaining({ kind: 'overlapping-intervals', count: 1, intervalIds: [2] }),
      ]);
    });

    it('flags closed intervals whose end is not after their start', async () => {
      intervalRepository.find.mockResolvedValue([interval(1, at(18, '08:00:00'), at(18, '08:00:00'))]);

      const report = await service.getDataQualityReport(1, at(20, '00:00:00'));

      expect(report.issues).toEqual([expect.objectContaining({ kind: 'negative-duration', count: 1 })]);
    });

    it('flags more than one open interval', async () => {
      intervalRepository.count.mockResolvedValue(2);

      const report = await service.getDataQualityReport(1, at(20, '00:00:00'));

      expect(report.issues).toEqual([expect.objectContaining({ kind: 'multiple-open-intervals', count: 2 })]);
    });
  });

  describe('verifyTimeline', () => {
    const from = at(1, '00:00:00');
    const to = at(20, '00:00:00');

    it('recomputes operating duration from interval rows and confirms a consistent derived view', async () => {
      intervalRepository.find.mockResolvedValue([
        interval(1, at(10, '08:00:00'), at(10, '10:00:00')),
        interval(2, at(12, '09:00:00'), null),
      ]);
      // open interval 2 clipped at `to`: 12th 09:00 -> 20th 00:00
      const openMs = to.getTime() - at(12, '09:00:00').getTime();
      attributionService.getForResource.mockResolvedValue(
        summary({
          operatingDurationMs: 2 * 60 * 60_000 + openMs,
          attributedOperatingDurationMs: 60 * 60_000,
          unattributedOperatingDurationMs: 60 * 60_000 + openMs,
        }),
      );

      const result = await service.verifyTimeline(1, from, to);

      expect(result.consistent).toBe(true);
      expect(result.recomputedOperatingDurationMs).toBe(2 * 60 * 60_000 + openMs);
      expect(result.intervalCount).toBe(2);
      expect(result.aggregatesPresent).toBe(false);
      expect(result.note).toContain('No persisted aggregates');
      expect(result.checks.every((check) => check.passed)).toBe(true);
      expect(attributionService.getForResource).toHaveBeenCalledWith(1, to, from);
    });

    it('reports inconsistency when the derived view disagrees with the timeline', async () => {
      intervalRepository.find.mockResolvedValue([interval(1, at(10, '08:00:00'), at(10, '10:00:00'))]);
      attributionService.getForResource.mockResolvedValue(
        summary({
          operatingDurationMs: 3 * 60 * 60_000,
          attributedOperatingDurationMs: 60 * 60_000,
          unattributedOperatingDurationMs: 2 * 60 * 60_000,
        }),
      );

      const result = await service.verifyTimeline(1, from, to);

      expect(result.consistent).toBe(false);
      expect(result.checks.find((check) => check.name === 'operating-duration-matches')).toEqual(
        expect.objectContaining({ passed: false }),
      );
    });

    it('reports a broken attributed/unattributed partition', async () => {
      intervalRepository.find.mockResolvedValue([interval(1, at(10, '08:00:00'), at(10, '10:00:00'))]);
      attributionService.getForResource.mockResolvedValue(
        summary({
          operatingDurationMs: 2 * 60 * 60_000,
          attributedOperatingDurationMs: 90 * 60_000,
          unattributedOperatingDurationMs: 90 * 60_000,
        }),
      );

      const result = await service.verifyTimeline(1, from, to);

      expect(result.consistent).toBe(false);
      expect(result.checks.find((check) => check.name === 'attribution-partition-matches')?.passed).toBe(false);
    });

    it('treats an unavailable operating view (null, not 0) as consistent with an empty timeline', async () => {
      intervalRepository.find.mockResolvedValue([]);
      attributionService.getForResource.mockResolvedValue(
        summary({
          operatingDataAvailable: false,
          operatingDurationMs: null,
          attributedOperatingDurationMs: null,
          unattributedOperatingDurationMs: null,
        }),
      );

      const result = await service.verifyTimeline(1, from, to);

      expect(result.operatingDataAvailable).toBe(false);
      expect(result.reportedOperatingDurationMs).toBeNull();
      expect(result.consistent).toBe(true);
    });

    it('flags an unavailable view that hides existing interval rows', async () => {
      intervalRepository.find.mockResolvedValue([interval(1, at(10, '08:00:00'), at(10, '10:00:00'))]);
      attributionService.getForResource.mockResolvedValue(
        summary({
          operatingDataAvailable: false,
          operatingDurationMs: null,
          attributedOperatingDurationMs: null,
          unattributedOperatingDurationMs: null,
        }),
      );

      const result = await service.verifyTimeline(1, from, to);

      expect(result.consistent).toBe(false);
      expect(result.checks.find((check) => check.name === 'operating-duration-matches')).toEqual(
        expect.objectContaining({ passed: false, detail: expect.stringContaining('unavailable') }),
      );
    });

    it('clips intervals that straddle the range boundaries', async () => {
      const before = new Date(from.getTime() - 60 * 60_000);
      const after = new Date(to.getTime() + 60 * 60_000);
      intervalRepository.find.mockResolvedValue([
        interval(1, before, at(2, '00:00:00')),
        interval(2, at(19, '00:00:00'), after),
      ]);
      attributionService.getForResource.mockResolvedValue(summary({ operatingDurationMs: 0 }));

      const result = await service.verifyTimeline(1, from, to);

      expect(result.recomputedOperatingDurationMs).toBe(24 * 60 * 60_000 + 24 * 60 * 60_000);
      expect(result.consistent).toBe(false);
    });
  });

  describe('unionDurationMs', () => {
    it('merges overlapping ranges and ignores empty ones', () => {
      expect(
        unionDurationMs([
          { start: 0, end: 10 },
          { start: 5, end: 20 },
          { start: 30, end: 30 },
          { start: 40, end: 35 },
        ]),
      ).toBe(20);
    });
  });
});
