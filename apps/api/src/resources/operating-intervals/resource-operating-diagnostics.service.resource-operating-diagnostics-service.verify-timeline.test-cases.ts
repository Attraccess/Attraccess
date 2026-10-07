import { registerResourceOperatingDiagnosticsServiceFixture } from './resource-operating-diagnostics.service.resource-operating-diagnostics-service.test-fixture';
export function registerVerifyTimelineCases(
  fixture: ReturnType<typeof registerResourceOperatingDiagnosticsServiceFixture>,
) {
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
}
