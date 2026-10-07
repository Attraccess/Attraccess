import { registerResourceOperatingAttributionServiceFixture } from './resource-operating-attribution.service.resource-operating-attribution-service.test-fixture';
import { ResourceOperatingInterval, ResourceUsage, ResourceUsageAction } from '@attraccess/database-entities';
import { MoreThan } from 'typeorm';

export function registerCalculatesACompletedUsageSessionFromItsExactOperatingOverlapCases(
  fixture: ReturnType<typeof registerResourceOperatingAttributionServiceFixture>,
) {
  it('calculates a completed usage session from its exact operating overlap', async () => {
    const manager = {
      getRepository: jest.fn(() => ({
        find: jest.fn().mockResolvedValue([fixture.operating(1, '10:00:00', '11:00:00')]),
      })),
    };
    const minutes = await fixture.service.getForUsage(fixture.usage(2, '10:15:00', '10:45:00'), manager as never);

    expect(minutes).toBe(30);
  });
}

export function registerClipsClosedIntervalsToTheAttributionSnapshotTimeCases(
  fixture: ReturnType<typeof registerResourceOperatingAttributionServiceFixture>,
) {
  it('clips closed intervals to the attribution snapshot time', () => {
    const result = fixture.service.derive(
      [fixture.operating(1, '10:00:00', '13:00:00')],
      [fixture.usage(2, '11:00:00', '13:00:00')],
      fixture.asOf,
    );

    expect(result).toMatchObject({
      operatingDurationMs: 2 * 60 * 60_000,
      attributedOperatingDurationMs: 60 * 60_000,
      unattributedOperatingDurationMs: 60 * 60_000,
      isProvisional: true,
      attributions: [expect.objectContaining({ endTime: fixture.asOf, isProvisional: true })],
    });
  });
}

export function registerDerivesAnExplicitDiagnosticsRangeThroughTheSameSweepAsTheDefaultWindowAtCases(
  fixture: ReturnType<typeof registerResourceOperatingAttributionServiceFixture>,
) {
  it('derives an explicit diagnostics range through the same sweep as the default window (ATT-1024)', async () => {
    fixture.intervalRepository.find.mockResolvedValue([
      fixture.operating(1, '10:00:00', '11:00:00'),
    ] as ResourceOperatingInterval[]);
    fixture.usageRepository.find.mockResolvedValue([fixture.usage(2, '10:15:00', '10:45:00')] as ResourceUsage[]);
    fixture.intervalRepository.existsBy.mockResolvedValue(true);
    const windowStart = fixture.at('09:00:00');

    const result = await fixture.service.getForResource(1, fixture.asOf, windowStart);

    expect(result.windowStart).toEqual(windowStart);
    expect(result).toMatchObject({
      operatingDurationMs: 60 * 60_000,
      attributedOperatingDurationMs: 30 * 60_000,
      unattributedOperatingDurationMs: 30 * 60_000,
    });
  });
}

export function registerDerivesExactClosedIntersectionsAndTheRemainingOperatingDurationCases(
  fixture: ReturnType<typeof registerResourceOperatingAttributionServiceFixture>,
) {
  it('derives exact closed intersections and the remaining operating duration', () => {
    const result = fixture.service.derive(
      [fixture.operating(1, '10:00:00', '11:00:00')],
      [fixture.usage(2, '10:15:00', '10:45:00')],
      fixture.asOf,
    );

    expect(result).toMatchObject({
      operatingDurationMs: 60 * 60_000,
      attributedOperatingDurationMs: 30 * 60_000,
      unattributedOperatingDurationMs: 30 * 60_000,
      isProvisional: false,
      attributions: [
        {
          operatingIntervalId: 1,
          usageId: 2,
          startTime: fixture.at('10:15:00'),
          endTime: fixture.at('10:45:00'),
          durationMs: 30 * 60_000,
          isProvisional: false,
        },
      ],
    });
  });
}

export function registerDoesNotAttributeAdjacentBoundariesCases(
  fixture: ReturnType<typeof registerResourceOperatingAttributionServiceFixture>,
) {
  it('does not attribute adjacent boundaries', () => {
    const result = fixture.service.derive(
      [fixture.operating(1, '10:00:00', '10:30:00')],
      [fixture.usage(2, '10:30:00', '11:00:00')],
      fixture.asOf,
    );

    expect(result).toMatchObject({
      attributedOperatingDurationMs: 0,
      unattributedOperatingDurationMs: 30 * 60_000,
      attributions: [],
    });
  });
}

export function registerDoesNotDoubleCountOperatingDurationWhenUsageSessionsOverlapCases(
  fixture: ReturnType<typeof registerResourceOperatingAttributionServiceFixture>,
) {
  it('does not double-count operating duration when usage sessions overlap', () => {
    const result = fixture.service.derive(
      [fixture.operating(1, '10:00:00', '11:00:00')],
      [fixture.usage(2, '10:10:00', '10:40:00'), fixture.usage(3, '10:30:00', '10:50:00')],
      fixture.asOf,
    );

    expect(result).toMatchObject({
      attributedOperatingDurationMs: 40 * 60_000,
      unattributedOperatingDurationMs: 20 * 60_000,
    });
    expect(result.attributions).toHaveLength(2);
  });
}

export function registerDoesNotReportOverlapBetweenOperatingIntervalsAsUnattributedCases(
  fixture: ReturnType<typeof registerResourceOperatingAttributionServiceFixture>,
) {
  it('does not report overlap between operating intervals as unattributed', () => {
    const result = fixture.service.derive(
      [fixture.operating(1, '10:00:00', '11:00:00'), fixture.operating(2, '10:30:00', '11:30:00')],
      [fixture.usage(3, '10:00:00', '11:30:00')],
      fixture.asOf,
    );

    expect(result).toMatchObject({
      operatingDurationMs: 90 * 60_000,
      attributedOperatingDurationMs: 90 * 60_000,
      unattributedOperatingDurationMs: 0,
    });
  });
}

export function registerGetDurationsForWindowsCases(
  fixture: ReturnType<typeof registerResourceOperatingAttributionServiceFixture>,
) {
  describe('getDurationsForWindows', () => {
    it('clips independent service cycles and unions overlapping intervals without requiring attribution', async () => {
      fixture.intervalRepository.find.mockResolvedValue([
        fixture.operating(1, '09:00:00', null),
        fixture.operating(2, '10:00:00', '11:00:00'),
        { ...fixture.operating(3, '11:30:00', null), resourceId: 2 },
      ]);
      fixture.usageRepository.find.mockResolvedValue([fixture.usage(1, '10:15:00', '10:45:00')]);

      const totals = await fixture.service.getDurationsForWindows(
        [
          { key: 'old:1', resourceId: 1, start: fixture.at('10:00:00') },
          { key: 'new:1', resourceId: 1, start: fixture.at('11:00:00') },
          { key: 'old:2', resourceId: 2, start: fixture.at('10:00:00') },
        ],
        fixture.asOf,
      );

      expect(totals).toEqual(
        new Map([
          ['old:1', { sessionDurationMs: 30 * 60_000, operatingDurationMs: 120 * 60_000 }],
          ['new:1', { sessionDurationMs: 0, operatingDurationMs: 60 * 60_000 }],
          ['old:2', { sessionDurationMs: 0, operatingDurationMs: 30 * 60_000 }],
        ]),
      );
      expect(fixture.intervalRepository.find).toHaveBeenCalledTimes(1);
      expect(fixture.usageRepository.find).toHaveBeenCalledTimes(1);
    });

    it('does not query the database when there are no duration windows', async () => {
      await expect(fixture.service.getDurationsForWindows([], fixture.asOf)).resolves.toEqual(new Map());
      expect(fixture.intervalRepository.find).not.toHaveBeenCalled();
      expect(fixture.usageRepository.find).not.toHaveBeenCalled();
    });

    it('uses each resource service-cycle boundary when loading a batch', async () => {
      fixture.intervalRepository.find.mockResolvedValue([]);
      fixture.usageRepository.find.mockResolvedValue([]);

      await fixture.service.getDurationsForWindows(
        [
          { key: 'old:1', resourceId: 1, start: fixture.at('01:00:00') },
          { key: 'new:2', resourceId: 2, start: fixture.at('11:00:00') },
        ],
        fixture.asOf,
      );

      const intervalWhere = fixture.intervalRepository.find.mock.calls[0][0].where as Array<{
        resourceId: number;
        endTime: unknown;
      }>;
      expect(intervalWhere).toHaveLength(4);
      expect(intervalWhere.filter(({ resourceId }) => resourceId === 1)).toEqual(
        expect.arrayContaining([expect.objectContaining({ endTime: MoreThan(fixture.at('01:00:00')) })]),
      );
      expect(intervalWhere.filter(({ resourceId }) => resourceId === 2)).toEqual(
        expect.arrayContaining([expect.objectContaining({ endTime: MoreThan(fixture.at('11:00:00')) })]),
      );
    });

    it('propagates unavailable authoritative data instead of returning a zero duration', async () => {
      fixture.intervalRepository.find.mockRejectedValue(new Error('interval read failed'));
      fixture.usageRepository.find.mockResolvedValue([]);
      await expect(
        fixture.service.getDurationsForWindows(
          [{ key: '1', resourceId: 1, start: fixture.at('10:00:00') }],
          fixture.asOf,
        ),
      ).rejects.toThrow('interval read failed');
    });
  });
}

export function registerIgnoresDoorControlAuditRowsCases(
  fixture: ReturnType<typeof registerResourceOperatingAttributionServiceFixture>,
) {
  it('ignores door-control audit rows', () => {
    const doorAction = {
      ...fixture.usage(2, '10:00:00', null),
      usageAction: ResourceUsageAction.DoorUnlock,
    };
    const result = fixture.service.derive([fixture.operating(1, '10:00:00', '11:00:00')], [doorAction], fixture.asOf);

    expect(result).toMatchObject({
      attributedOperatingDurationMs: 0,
      unattributedOperatingDurationMs: 60 * 60_000,
      attributions: [],
    });
  });
}
