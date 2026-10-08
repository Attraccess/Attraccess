import { registerResourceOperatingAttributionServiceFixture } from './resource-operating-attribution.service.resource-operating-attribution-service.test-fixture';
import { ResourceOperatingInterval, ResourceUsage, ResourceUsageAction } from '@attraccess/database-entities';
import { MoreThan } from 'typeorm';

describe('ResourceOperatingAttributionService', () => {
  const fixture = registerResourceOperatingAttributionServiceFixture();

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

  it('calculates a completed usage session from its exact operating overlap', async () => {
    const manager = {
      getRepository: jest.fn(() => ({
        find: jest.fn().mockResolvedValue([fixture.operating(1, '10:00:00', '11:00:00')]),
      })),
    };
    const minutes = await fixture.service.getForUsage(fixture.usage(2, '10:15:00', '10:45:00'), manager as never);

    expect(minutes).toBe(30);
  });

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
});
