import { registerResourceOperatingDiagnosticsServiceFixture } from './resource-operating-diagnostics.service.resource-operating-diagnostics-service.test-fixture';
import { unionDurationMs } from './resource-operating-diagnostics.service';

describe('ResourceOperatingDiagnosticsService', () => {
  const fixture = registerResourceOperatingDiagnosticsServiceFixture();

  describe('getCurrentState', () => {
    it('reports operating with the open interval when one exists', async () => {
      const open = fixture.interval(5, fixture.at(18, '08:00:00'), null);
      fixture.intervalRepository.findOne.mockResolvedValueOnce(open).mockResolvedValueOnce(open);

      const state = await fixture.service.getCurrentState(1);

      expect(state).toEqual({
        state: 'operating',
        openInterval: { id: 5, startTime: fixture.at(18, '08:00:00') },
        lastTransitionAt: fixture.at(18, '08:00:00'),
      });
    });

    it('reports idle with the last closed transition when no interval is open', async () => {
      const closed = fixture.interval(4, fixture.at(17, '08:00:00'), fixture.at(17, '10:30:00'));
      fixture.intervalRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(closed);

      const state = await fixture.service.getCurrentState(1);

      expect(state).toEqual({
        state: 'idle',
        openInterval: null,
        lastTransitionAt: fixture.at(17, '10:30:00'),
      });
    });

    it('reports idle without a last transition for a resource that never operated', async () => {
      fixture.intervalRepository.findOne.mockResolvedValue(null);

      await expect(fixture.service.getCurrentState(1)).resolves.toEqual({
        state: 'idle',
        openInterval: null,
        lastTransitionAt: null,
      });
    });
  });

  describe('getTransitionHistory', () => {
    it('exposes recorded provenance for each boundary and leaves legacy provenance unknown', async () => {
      fixture.intervalRepository.findAndCount.mockResolvedValue([
        [
          {
            ...fixture.interval(2, fixture.at(12, '09:00:00'), fixture.at(12, '11:00:00')),
            startFlowNodeId: 'start-node',
            startFlowRunId: 'start-run',
            endFlowNodeId: 'stop-node',
            endFlowRunId: 'stop-run',
          },
          fixture.interval(1, fixture.at(10, '08:00:00'), null),
        ],
        2,
      ]);

      const page = await fixture.service.getTransitionHistory(1, 1, 20);

      expect(page.items.map(({ state, flowNodeId, flowRunId }) => ({ state, flowNodeId, flowRunId }))).toEqual([
        { state: 'idle', flowNodeId: 'stop-node', flowRunId: 'stop-run' },
        { state: 'operating', flowNodeId: 'start-node', flowRunId: 'start-run' },
        { state: 'operating', flowNodeId: null, flowRunId: null },
      ]);
    });

    it('derives descending transitions from interval rows and paginates over rows', async () => {
      fixture.intervalRepository.findAndCount.mockResolvedValue([
        [
          fixture.interval(2, fixture.at(12, '09:00:00'), fixture.at(12, '11:00:00')),
          fixture.interval(1, fixture.at(10, '08:00:00'), null),
        ],
        2,
      ]);

      const page = await fixture.service.getTransitionHistory(1, 1, 20);

      expect(page.totalIntervals).toBe(2);
      expect(page.items.map((item) => [item.timestamp.toISOString(), item.state, item.intervalId])).toEqual([
        [fixture.at(12, '11:00:00').toISOString(), 'idle', 2],
        [fixture.at(12, '09:00:00').toISOString(), 'operating', 2],
        [fixture.at(10, '08:00:00').toISOString(), 'operating', 1],
      ]);
      expect(page.items.every((item) => item.source === 'flow-signal')).toBe(true);
      expect(fixture.intervalRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20, order: { startTime: 'DESC' } }),
      );
    });

    it('skips interval rows for later pages', async () => {
      await fixture.service.getTransitionHistory(1, 3, 5);

      expect(fixture.intervalRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 }),
      );
    });
  });

  describe('getDataQualityReport', () => {
    it('reports a clean timeline without issues', async () => {
      fixture.flowNodeRepository.count.mockResolvedValue(2);
      fixture.intervalRepository.find.mockResolvedValue([
        fixture.interval(1, fixture.at(18, '08:00:00'), fixture.at(18, '10:00:00')),
      ]);

      const report = await fixture.service.getDataQualityReport(1, fixture.at(20, '00:00:00'));

      expect(report.trackingConfigured).toBe(true);
      expect(report.issues).toEqual([]);
      expect(fixture.operatingMetrics.recordDataQualityFailures).not.toHaveBeenCalled();
    });

    it('flags tracking configured but no signal in the window', async () => {
      fixture.flowNodeRepository.count.mockResolvedValue(1);
      fixture.intervalRepository.find.mockResolvedValue([]);
      fixture.intervalRepository.count.mockResolvedValue(0);

      const report = await fixture.service.getDataQualityReport(1, fixture.at(20, '00:00:00'));

      expect(report.issues).toEqual([expect.objectContaining({ kind: 'stale-signal', count: 1 })]);
      expect(fixture.operatingMetrics.recordDataQualityFailures).toHaveBeenCalledWith('stale-signal', 1);
    });

    it('does not flag a long-running open interval as stale', async () => {
      fixture.flowNodeRepository.count.mockResolvedValue(1);
      fixture.intervalRepository.find.mockResolvedValue([]);
      fixture.intervalRepository.count.mockResolvedValue(1);

      const report = await fixture.service.getDataQualityReport(1, fixture.at(20, '00:00:00'));

      expect(report.issues).toEqual([]);
    });

    it('flags overlapping intervals as out-of-order transitions', async () => {
      fixture.intervalRepository.find.mockResolvedValue([
        fixture.interval(1, fixture.at(18, '08:00:00'), fixture.at(18, '12:00:00')),
        fixture.interval(2, fixture.at(18, '10:00:00'), fixture.at(18, '14:00:00')),
      ]);

      const report = await fixture.service.getDataQualityReport(1, fixture.at(20, '00:00:00'));

      expect(report.issues).toEqual([
        expect.objectContaining({ kind: 'overlapping-intervals', count: 1, intervalIds: [2] }),
      ]);
    });

    it('flags closed intervals whose end is not after their start', async () => {
      fixture.intervalRepository.find.mockResolvedValue([
        fixture.interval(1, fixture.at(18, '08:00:00'), fixture.at(18, '08:00:00')),
      ]);

      const report = await fixture.service.getDataQualityReport(1, fixture.at(20, '00:00:00'));

      expect(report.issues).toEqual([expect.objectContaining({ kind: 'negative-duration', count: 1 })]);
    });

    it('flags more than one open interval', async () => {
      fixture.intervalRepository.count.mockResolvedValue(2);

      const report = await fixture.service.getDataQualityReport(1, fixture.at(20, '00:00:00'));

      expect(report.issues).toEqual([expect.objectContaining({ kind: 'multiple-open-intervals', count: 2 })]);
    });
  });

  describe('verifyTimeline', () => {
    const from = fixture.at(1, '00:00:00');
    const to = fixture.at(20, '00:00:00');

    it('recomputes operating duration from interval rows and confirms a consistent derived view', async () => {
      fixture.intervalRepository.find.mockResolvedValue([
        fixture.interval(1, fixture.at(10, '08:00:00'), fixture.at(10, '10:00:00')),
        fixture.interval(2, fixture.at(12, '09:00:00'), null),
      ]);
      // open interval 2 clipped at `to`: 12th 09:00 -> 20th 00:00
      const openMs = to.getTime() - fixture.at(12, '09:00:00').getTime();
      fixture.attributionService.getForResource.mockResolvedValue(
        fixture.summary({
          operatingDurationMs: 2 * 60 * 60_000 + openMs,
          attributedOperatingDurationMs: 60 * 60_000,
          unattributedOperatingDurationMs: 60 * 60_000 + openMs,
        }),
      );

      const result = await fixture.service.verifyTimeline(1, from, to);

      expect(result.consistent).toBe(true);
      expect(result.recomputedOperatingDurationMs).toBe(2 * 60 * 60_000 + openMs);
      expect(result.intervalCount).toBe(2);
      expect(result.aggregatesPresent).toBe(false);
      expect(result.note).toContain('No persisted aggregates');
      expect(result.checks.every((check) => check.passed)).toBe(true);
      expect(fixture.attributionService.getForResource).toHaveBeenCalledWith(1, to, from);
    });

    it('reports inconsistency when the derived view disagrees with the timeline', async () => {
      fixture.intervalRepository.find.mockResolvedValue([
        fixture.interval(1, fixture.at(10, '08:00:00'), fixture.at(10, '10:00:00')),
      ]);
      fixture.attributionService.getForResource.mockResolvedValue(
        fixture.summary({
          operatingDurationMs: 3 * 60 * 60_000,
          attributedOperatingDurationMs: 60 * 60_000,
          unattributedOperatingDurationMs: 2 * 60 * 60_000,
        }),
      );

      const result = await fixture.service.verifyTimeline(1, from, to);

      expect(result.consistent).toBe(false);
      expect(result.checks.find((check) => check.name === 'operating-duration-matches')).toEqual(
        expect.objectContaining({ passed: false }),
      );
    });

    it('reports a broken attributed/unattributed partition', async () => {
      fixture.intervalRepository.find.mockResolvedValue([
        fixture.interval(1, fixture.at(10, '08:00:00'), fixture.at(10, '10:00:00')),
      ]);
      fixture.attributionService.getForResource.mockResolvedValue(
        fixture.summary({
          operatingDurationMs: 2 * 60 * 60_000,
          attributedOperatingDurationMs: 90 * 60_000,
          unattributedOperatingDurationMs: 90 * 60_000,
        }),
      );

      const result = await fixture.service.verifyTimeline(1, from, to);

      expect(result.consistent).toBe(false);
      expect(result.checks.find((check) => check.name === 'attribution-partition-matches')?.passed).toBe(false);
    });

    it('treats an unavailable operating view (null, not 0) as consistent with an empty timeline', async () => {
      fixture.intervalRepository.find.mockResolvedValue([]);
      fixture.attributionService.getForResource.mockResolvedValue(
        fixture.summary({
          operatingDataAvailable: false,
          operatingDurationMs: null,
          attributedOperatingDurationMs: null,
          unattributedOperatingDurationMs: null,
        }),
      );

      const result = await fixture.service.verifyTimeline(1, from, to);

      expect(result.operatingDataAvailable).toBe(false);
      expect(result.reportedOperatingDurationMs).toBeNull();
      expect(result.consistent).toBe(true);
    });

    it('flags an unavailable view that hides existing interval rows', async () => {
      fixture.intervalRepository.find.mockResolvedValue([
        fixture.interval(1, fixture.at(10, '08:00:00'), fixture.at(10, '10:00:00')),
      ]);
      fixture.attributionService.getForResource.mockResolvedValue(
        fixture.summary({
          operatingDataAvailable: false,
          operatingDurationMs: null,
          attributedOperatingDurationMs: null,
          unattributedOperatingDurationMs: null,
        }),
      );

      const result = await fixture.service.verifyTimeline(1, from, to);

      expect(result.consistent).toBe(false);
      expect(result.checks.find((check) => check.name === 'operating-duration-matches')).toEqual(
        expect.objectContaining({ passed: false, detail: expect.stringContaining('unavailable') }),
      );
    });

    it('clips intervals that straddle the range boundaries', async () => {
      const before = new Date(from.getTime() - 60 * 60_000);
      const after = new Date(to.getTime() + 60 * 60_000);
      fixture.intervalRepository.find.mockResolvedValue([
        fixture.interval(1, before, fixture.at(2, '00:00:00')),
        fixture.interval(2, fixture.at(19, '00:00:00'), after),
      ]);
      fixture.attributionService.getForResource.mockResolvedValue(fixture.summary({ operatingDurationMs: 0 }));

      const result = await fixture.service.verifyTimeline(1, from, to);

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
