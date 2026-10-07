import { ResourceOperatingInterval, ResourceUsage, ResourceUsageAction } from '@attraccess/database-entities';
import { registerResourceOperatingAttributionServiceFixture } from './resource-operating-attribution.service.resource-operating-attribution-service.test-fixture';

export function registerLoadsAndDerivesReportsForMultipleResourcesInOneQueryPerSourceCases(
  fixture: ReturnType<typeof registerResourceOperatingAttributionServiceFixture>,
) {
  it('loads and derives reports for multiple resources in one query per source', async () => {
    fixture.intervalRepository.find.mockResolvedValue([
      fixture.operating(1, '10:00:00', '11:00:00'),
      { ...fixture.operating(2, '10:00:00', '10:30:00'), resourceId: 2 },
    ] as ResourceOperatingInterval[]);
    fixture.usageRepository.find.mockResolvedValue([
      fixture.usage(1, '10:00:00', '10:30:00'),
      { ...fixture.usage(2, '10:00:00', '10:15:00'), resourceId: 2 },
    ] as ResourceUsage[]);
    fixture.availabilityQuery.getRawMany.mockResolvedValue([{ resourceId: 1 }, { resourceId: 2 }]);

    const result = await fixture.service.getForResources([1, 2], fixture.at('09:00:00'), fixture.asOf);

    expect(result.get(1)).toMatchObject({ sessionDurationMs: 30 * 60_000, operatingDurationMs: 60 * 60_000 });
    expect(result.get(2)).toMatchObject({ sessionDurationMs: 15 * 60_000, operatingDurationMs: 30 * 60_000 });
    expect(fixture.intervalRepository.find).toHaveBeenCalledTimes(1);
    expect(fixture.usageRepository.find).toHaveBeenCalledTimes(1);
    expect(fixture.intervalRepository.createQueryBuilder).toHaveBeenCalledWith('interval');
    expect(fixture.availabilityQuery.select).toHaveBeenCalledWith('DISTINCT interval.resourceId', 'resourceId');
    expect(fixture.availabilityQuery.where).toHaveBeenCalledWith('interval.resourceId IN (:...resourceIds)', {
      resourceIds: [1, 2],
    });
  });
}

export function registerLoadsOnlyIntervalsThatOverlapTheRecentAttributionWindowCases(
  fixture: ReturnType<typeof registerResourceOperatingAttributionServiceFixture>,
) {
  it('loads only intervals that overlap the recent attribution window', async () => {
    fixture.intervalRepository.find.mockResolvedValue([] as ResourceOperatingInterval[]);
    fixture.usageRepository.find.mockResolvedValue([] as ResourceUsage[]);

    const result = await fixture.service.getForResource(1, fixture.asOf);

    expect(result.windowStart).toEqual(new Date('2026-07-28T12:00:00.000Z'));

    expect(fixture.intervalRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.arrayContaining([
          expect.objectContaining({ resourceId: 1 }),
          expect.objectContaining({ resourceId: 1 }),
        ]),
      }),
    );
    expect(fixture.usageRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.arrayContaining([
          expect.objectContaining({ resourceId: 1, usageAction: ResourceUsageAction.Usage }),
          expect.objectContaining({ resourceId: 1, usageAction: ResourceUsageAction.Usage }),
        ]),
      }),
    );
  });
}

export function registerMarksASnapshotProvisionalForAnUnmatchedOpenUsageSessionCases(
  fixture: ReturnType<typeof registerResourceOperatingAttributionServiceFixture>,
) {
  it('marks a snapshot provisional for an unmatched open usage session', () => {
    const result = fixture.service.derive([], [fixture.usage(2, '10:00:00', null)], fixture.asOf);

    expect(result).toMatchObject({
      operatingDurationMs: null,
      attributedOperatingDurationMs: null,
      unattributedOperatingDurationMs: null,
      isProvisional: true,
      attributions: [],
    });
  });
}

export function registerMarksAnOtherwiseClosedOperatingIntervalProvisionalWhileItsUsageSessionRemaCases(
  fixture: ReturnType<typeof registerResourceOperatingAttributionServiceFixture>,
) {
  it('marks an otherwise closed operating interval provisional while its usage session remains open', () => {
    const result = fixture.service.derive(
      [fixture.operating(1, '10:00:00', '11:00:00')],
      [fixture.usage(2, '10:15:00', null)],
      fixture.asOf,
    );

    expect(result).toMatchObject({
      attributedOperatingDurationMs: 45 * 60_000,
      isProvisional: true,
      attributions: [expect.objectContaining({ isProvisional: true })],
    });
  });
}

export function registerMarksIntersectionsProvisionalWhileEitherSourceIntervalIsOpenCases(
  fixture: ReturnType<typeof registerResourceOperatingAttributionServiceFixture>,
) {
  it('marks intersections provisional while either source interval is open', () => {
    const result = fixture.service.derive(
      [fixture.operating(1, '10:00:00', null)],
      [fixture.usage(2, '10:15:00', '11:00:00')],
      fixture.asOf,
    );

    expect(result).toMatchObject({
      operatingDurationMs: 120 * 60_000,
      attributedOperatingDurationMs: 45 * 60_000,
      unattributedOperatingDurationMs: 75 * 60_000,
      isProvisional: true,
      attributions: [expect.objectContaining({ durationMs: 45 * 60_000, isProvisional: true })],
    });
  });
}

export function registerReportsNoDerivedDurationForResourcesWithoutAnOperatingSignalCases(
  fixture: ReturnType<typeof registerResourceOperatingAttributionServiceFixture>,
) {
  it('reports no derived duration for resources without an operating signal', () => {
    const result = fixture.service.derive([], [fixture.usage(2, '10:00:00', '11:00:00')], fixture.asOf);

    expect(result).toEqual({
      asOf: fixture.asOf,
      windowStart: null,
      sessionDurationMs: 60 * 60_000,
      operatingDataAvailable: false,
      operatingDurationMs: null,
      attributedOperatingDurationMs: null,
      unattributedOperatingDurationMs: null,
      isOperating: false,
      isProvisional: false,
      attributions: [],
    });
  });
}

export function registerRetainsTheGapBetweenTakeoverSessionsAsUnattributedCases(
  fixture: ReturnType<typeof registerResourceOperatingAttributionServiceFixture>,
) {
  it('retains the gap between takeover sessions as unattributed', () => {
    const result = fixture.service.derive(
      [fixture.operating(1, '10:00:00', '11:00:00')],
      [fixture.usage(2, '10:00:00', '10:25:00'), fixture.usage(3, '10:35:00', '11:00:00')],
      fixture.asOf,
    );

    expect(result).toMatchObject({
      attributedOperatingDurationMs: 50 * 60_000,
      unattributedOperatingDurationMs: 10 * 60_000,
    });
  });
}

export function registerSweepsIntervalEndpointsWithoutRevisitingExpiredSessionsCases(
  fixture: ReturnType<typeof registerResourceOperatingAttributionServiceFixture>,
) {
  it('sweeps interval endpoints without revisiting expired sessions', () => {
    const intersection = jest.spyOn(
      fixture.service as unknown as { intersection: (left: unknown, right: unknown) => unknown },
      'intersection',
    );
    const operatingIntervals = Array.from({ length: 10 }, (_, index) => {
      const minute = String(index + 10).padStart(2, '0');
      return fixture.operating(index + 1, `10:${minute}:00`, `10:${String(index + 11).padStart(2, '0')}:00`);
    });

    const result = fixture.service.derive(
      operatingIntervals,
      [fixture.usage(1, '10:00:00', '11:00:00'), fixture.usage(2, '10:00:00', '10:05:00')],
      fixture.asOf,
    );

    expect(result.attributions).toHaveLength(10);
    expect(intersection).toHaveBeenCalledTimes(10);
  });
}
