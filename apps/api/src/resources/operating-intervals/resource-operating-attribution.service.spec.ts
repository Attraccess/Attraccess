import { ResourceOperatingInterval, ResourceUsage, ResourceUsageAction } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { ResourceOperatingAttributionService } from './resource-operating-attribution.service';

const at = (time: string) => new Date(`2026-08-28T${time}.000Z`);

const operating = (id: number, startTime: string, endTime: string | null): ResourceOperatingInterval =>
  ({ id, resourceId: 1, startTime: at(startTime), endTime: endTime ? at(endTime) : null }) as ResourceOperatingInterval;

const usage = (id: number, startTime: string, endTime: string | null): ResourceUsage =>
  ({
    id,
    resourceId: 1,
    usageAction: ResourceUsageAction.Usage,
    startTime: at(startTime),
    endTime: endTime ? at(endTime) : null,
  }) as ResourceUsage;

describe('ResourceOperatingAttributionService', () => {
  const asOf = at('12:00:00');
  let service: ResourceOperatingAttributionService;
  let intervalRepository: jest.Mocked<Pick<Repository<ResourceOperatingInterval>, 'find'>>;
  let usageRepository: jest.Mocked<Pick<Repository<ResourceUsage>, 'find'>>;

  beforeEach(() => {
    intervalRepository = { find: jest.fn() };
    usageRepository = { find: jest.fn() };
    service = new ResourceOperatingAttributionService(
      intervalRepository as unknown as Repository<ResourceOperatingInterval>,
      usageRepository as unknown as Repository<ResourceUsage>,
    );
  });

  it('derives exact closed intersections and the remaining operating duration', () => {
    const result = service.derive([operating(1, '10:00:00', '11:00:00')], [usage(2, '10:15:00', '10:45:00')], asOf);

    expect(result).toMatchObject({
      operatingDurationMs: 60 * 60_000,
      attributedOperatingDurationMs: 30 * 60_000,
      unattributedOperatingDurationMs: 30 * 60_000,
      isProvisional: false,
      attributions: [
        {
          operatingIntervalId: 1,
          usageId: 2,
          startTime: at('10:15:00'),
          endTime: at('10:45:00'),
          durationMs: 30 * 60_000,
          isProvisional: false,
        },
      ],
    });
  });

  it('marks intersections provisional while either source interval is open', () => {
    const result = service.derive([operating(1, '10:00:00', null)], [usage(2, '10:15:00', '11:00:00')], asOf);

    expect(result).toMatchObject({
      operatingDurationMs: 120 * 60_000,
      attributedOperatingDurationMs: 45 * 60_000,
      unattributedOperatingDurationMs: 75 * 60_000,
      isProvisional: true,
      attributions: [expect.objectContaining({ durationMs: 45 * 60_000, isProvisional: true })],
    });
  });

  it('marks an otherwise closed operating interval provisional while its usage session remains open', () => {
    const result = service.derive([operating(1, '10:00:00', '11:00:00')], [usage(2, '10:15:00', null)], asOf);

    expect(result).toMatchObject({
      attributedOperatingDurationMs: 45 * 60_000,
      isProvisional: true,
      attributions: [expect.objectContaining({ isProvisional: true })],
    });
  });

  it('does not attribute adjacent boundaries', () => {
    const result = service.derive([operating(1, '10:00:00', '10:30:00')], [usage(2, '10:30:00', '11:00:00')], asOf);

    expect(result).toMatchObject({
      attributedOperatingDurationMs: 0,
      unattributedOperatingDurationMs: 30 * 60_000,
      attributions: [],
    });
  });

  it('retains the gap between takeover sessions as unattributed', () => {
    const result = service.derive(
      [operating(1, '10:00:00', '11:00:00')],
      [usage(2, '10:00:00', '10:25:00'), usage(3, '10:35:00', '11:00:00')],
      asOf,
    );

    expect(result).toMatchObject({
      attributedOperatingDurationMs: 50 * 60_000,
      unattributedOperatingDurationMs: 10 * 60_000,
    });
  });

  it('does not double-count operating duration when usage sessions overlap', () => {
    const result = service.derive(
      [operating(1, '10:00:00', '11:00:00')],
      [usage(2, '10:10:00', '10:40:00'), usage(3, '10:30:00', '10:50:00')],
      asOf,
    );

    expect(result).toMatchObject({
      attributedOperatingDurationMs: 40 * 60_000,
      unattributedOperatingDurationMs: 20 * 60_000,
    });
    expect(result.attributions).toHaveLength(2);
  });

  it('sweeps interval endpoints without revisiting expired sessions', () => {
    const intersection = jest.spyOn(
      service as unknown as { intersection: (left: unknown, right: unknown) => unknown },
      'intersection',
    );
    const operatingIntervals = Array.from({ length: 10 }, (_, index) => {
      const minute = String(index + 10).padStart(2, '0');
      return operating(index + 1, `10:${minute}:00`, `10:${String(index + 11).padStart(2, '0')}:00`);
    });

    const result = service.derive(
      operatingIntervals,
      [usage(1, '10:00:00', '11:00:00'), usage(2, '10:00:00', '10:05:00')],
      asOf,
    );

    expect(result.attributions).toHaveLength(10);
    expect(intersection).toHaveBeenCalledTimes(10);
  });

  it('does not report overlap between operating intervals as unattributed', () => {
    const result = service.derive(
      [operating(1, '10:00:00', '11:00:00'), operating(2, '10:30:00', '11:30:00')],
      [usage(3, '10:00:00', '11:30:00')],
      asOf,
    );

    expect(result).toMatchObject({
      operatingDurationMs: 90 * 60_000,
      attributedOperatingDurationMs: 90 * 60_000,
      unattributedOperatingDurationMs: 0,
    });
  });

  it('ignores door-control audit rows', () => {
    const doorAction = {
      ...usage(2, '10:00:00', null),
      usageAction: ResourceUsageAction.DoorUnlock,
    };
    const result = service.derive([operating(1, '10:00:00', '11:00:00')], [doorAction], asOf);

    expect(result).toMatchObject({
      attributedOperatingDurationMs: 0,
      unattributedOperatingDurationMs: 60 * 60_000,
      attributions: [],
    });
  });

  it('reports no derived duration for resources without an operating signal', () => {
    const result = service.derive([], [usage(2, '10:00:00', '11:00:00')], asOf);

    expect(result).toEqual({
      asOf,
      windowStart: null,
      operatingDurationMs: 0,
      attributedOperatingDurationMs: 0,
      unattributedOperatingDurationMs: 0,
      isProvisional: false,
      attributions: [],
    });
  });

  it('marks a snapshot provisional for an unmatched open usage session', () => {
    const result = service.derive([], [usage(2, '10:00:00', null)], asOf);

    expect(result).toMatchObject({
      operatingDurationMs: 0,
      attributedOperatingDurationMs: 0,
      unattributedOperatingDurationMs: 0,
      isProvisional: true,
      attributions: [],
    });
  });

  it('clips closed intervals to the attribution snapshot time', () => {
    const result = service.derive([operating(1, '10:00:00', '13:00:00')], [usage(2, '11:00:00', '13:00:00')], asOf);

    expect(result).toMatchObject({
      operatingDurationMs: 2 * 60 * 60_000,
      attributedOperatingDurationMs: 60 * 60_000,
      unattributedOperatingDurationMs: 60 * 60_000,
      isProvisional: true,
      attributions: [expect.objectContaining({ endTime: asOf, isProvisional: true })],
    });
  });

  it('loads only intervals that overlap the recent attribution window', async () => {
    intervalRepository.find.mockResolvedValue([] as ResourceOperatingInterval[]);
    usageRepository.find.mockResolvedValue([] as ResourceUsage[]);

    const result = await service.getForResource(1, asOf);

    expect(result.windowStart).toEqual(new Date('2026-07-28T12:00:00.000Z'));

    expect(intervalRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.arrayContaining([
          expect.objectContaining({ resourceId: 1 }),
          expect.objectContaining({ resourceId: 1 }),
        ]),
      }),
    );
    expect(usageRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.arrayContaining([
          expect.objectContaining({ resourceId: 1, usageAction: ResourceUsageAction.Usage }),
          expect.objectContaining({ resourceId: 1, usageAction: ResourceUsageAction.Usage }),
        ]),
      }),
    );
  });
});
