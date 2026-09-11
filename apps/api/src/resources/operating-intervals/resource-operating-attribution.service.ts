import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResourceOperatingInterval, ResourceUsage, ResourceUsageAction } from '@attraccess/database-entities';
import { In, IsNull, LessThan, MoreThan, Repository } from 'typeorm';

const ATTRIBUTION_LOOKBACK_MS = 31 * 24 * 60 * 60_000;

export interface ResourceOperatingAttribution {
  operatingIntervalId: number;
  usageId: number;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  isProvisional: boolean;
}

export interface ResourceOperatingAttributionSummary {
  asOf: Date;
  windowStart: Date | null;
  sessionDurationMs: number;
  operatingDataAvailable: boolean;
  operatingDurationMs: number | null;
  attributedOperatingDurationMs: number | null;
  unattributedOperatingDurationMs: number | null;
  isOperating: boolean;
  isProvisional: boolean;
  attributions: ResourceOperatingAttribution[];
}

interface TimeRange {
  startTime: Date;
  endTime: Date;
}

interface OperatingRange {
  interval: ResourceOperatingInterval;
  range: TimeRange;
}

interface UsageRange {
  usage: ResourceUsage;
  range: TimeRange;
}

type SweepEvent =
  | { type: 'operatingStart' | 'operatingEnd'; range: OperatingRange }
  | { type: 'usageStart' | 'usageEnd'; range: UsageRange };

@Injectable()
export class ResourceOperatingAttributionService {
  constructor(
    @InjectRepository(ResourceOperatingInterval)
    private readonly intervalRepository: Repository<ResourceOperatingInterval>,
    @InjectRepository(ResourceUsage)
    private readonly usageRepository: Repository<ResourceUsage>,
  ) {}

  async getForResource(
    resourceId: number,
    asOf = new Date(),
    windowStart = new Date(asOf.getTime() - ATTRIBUTION_LOOKBACK_MS),
  ): Promise<ResourceOperatingAttributionSummary> {
    const [operatingIntervals, usages, operatingDataAvailable] = await Promise.all([
      this.intervalRepository.find({
        where: [
          { resourceId, startTime: LessThan(asOf), endTime: IsNull() },
          { resourceId, startTime: LessThan(asOf), endTime: MoreThan(windowStart) },
        ],
        order: { startTime: 'ASC' },
      }),
      this.usageRepository.find({
        where: [
          { resourceId, usageAction: ResourceUsageAction.Usage, startTime: LessThan(asOf), endTime: IsNull() },
          {
            resourceId,
            usageAction: ResourceUsageAction.Usage,
            startTime: LessThan(asOf),
            endTime: MoreThan(windowStart),
          },
        ],
        order: { startTime: 'ASC' },
      }),
      this.intervalRepository.existsBy({ resourceId }),
    ]);

    return this.derive(operatingIntervals, usages, asOf, windowStart, operatingDataAvailable);
  }

  async getForResources(
    resourceIds: number[],
    windowStart: Date,
    asOf: Date,
    liveValuesMayChange = true,
  ): Promise<Map<number, ResourceOperatingAttributionSummary>> {
    const uniqueResourceIds = [...new Set(resourceIds)];
    if (uniqueResourceIds.length === 0) {
      return new Map();
    }

    const [operatingIntervals, usages, resourcesWithOperatingData] = await Promise.all([
      this.intervalRepository.find({
        where: [
          { resourceId: In(uniqueResourceIds), startTime: LessThan(asOf), endTime: IsNull() },
          { resourceId: In(uniqueResourceIds), startTime: LessThan(asOf), endTime: MoreThan(windowStart) },
        ],
        order: { startTime: 'ASC' },
      }),
      this.usageRepository.find({
        where: [
          {
            resourceId: In(uniqueResourceIds),
            usageAction: ResourceUsageAction.Usage,
            startTime: LessThan(asOf),
            endTime: IsNull(),
          },
          {
            resourceId: In(uniqueResourceIds),
            usageAction: ResourceUsageAction.Usage,
            startTime: LessThan(asOf),
            endTime: MoreThan(windowStart),
          },
        ],
        order: { startTime: 'ASC' },
      }),
      this.intervalRepository
        .createQueryBuilder('interval')
        .select('DISTINCT interval.resourceId', 'resourceId')
        .where('interval.resourceId IN (:...resourceIds)', { resourceIds: uniqueResourceIds })
        .getRawMany<{ resourceId: number }>(),
    ]);
    const availableResourceIds = new Set(resourcesWithOperatingData.map(({ resourceId }) => resourceId));
    const groupByResourceId = <T extends { resourceId: number }>(items: T[]) =>
      items.reduce((grouped, item) => {
        const group = grouped.get(item.resourceId) ?? [];
        group.push(item);
        grouped.set(item.resourceId, group);
        return grouped;
      }, new Map<number, T[]>());
    const intervalsByResourceId = groupByResourceId(operatingIntervals);
    const usagesByResourceId = groupByResourceId(usages);

    return new Map(
      uniqueResourceIds.map((resourceId) => [
        resourceId,
        this.derive(
          intervalsByResourceId.get(resourceId) ?? [],
          usagesByResourceId.get(resourceId) ?? [],
          asOf,
          windowStart,
          availableResourceIds.has(resourceId),
          liveValuesMayChange,
        ),
      ]),
    );
  }

  derive(
    operatingIntervals: ResourceOperatingInterval[],
    usages: ResourceUsage[],
    asOf = new Date(),
    windowStart?: Date,
    operatingDataAvailable = operatingIntervals.length > 0,
    liveValuesMayChange = true,
  ): ResourceOperatingAttributionSummary {
    const attributions: ResourceOperatingAttribution[] = [];
    const attributedRanges: TimeRange[] = [];
    const operatingRanges = operatingIntervals
      .map((interval) => ({ interval, range: this.toRange(interval, asOf, windowStart) }))
      .filter((entry): entry is OperatingRange => entry.range !== null);
    const usageRanges = usages
      .filter((usage) => usage.usageAction === ResourceUsageAction.Usage)
      .map((usage) => ({ usage, range: this.toRange(usage, asOf, windowStart) }))
      .filter((entry): entry is UsageRange => entry.range !== null);
    const events: SweepEvent[] = [
      ...operatingRanges.flatMap((range) => [
        { type: 'operatingStart' as const, range },
        { type: 'operatingEnd' as const, range },
      ]),
      ...usageRanges.flatMap((range) => [
        { type: 'usageStart' as const, range },
        { type: 'usageEnd' as const, range },
      ]),
    ].sort((left, right) => {
      const leftTime = left.type.endsWith('Start') ? left.range.range.startTime : left.range.range.endTime;
      const rightTime = right.type.endsWith('Start') ? right.range.range.startTime : right.range.range.endTime;
      return (
        leftTime.getTime() - rightTime.getTime() ||
        Number(left.type.endsWith('Start')) - Number(right.type.endsWith('Start'))
      );
    });
    const activeOperatingRanges = new Set<OperatingRange>();
    const activeUsageRanges = new Set<UsageRange>();
    let isProvisional =
      operatingRanges.some(({ interval }) => this.isOpenAt(interval, asOf)) ||
      usageRanges.some(({ usage }) => this.isOpenAt(usage, asOf));

    const addAttribution = (operatingRange: OperatingRange, usageRange: UsageRange) => {
      const intersection = this.intersection(operatingRange.range, usageRange.range);
      if (!intersection) {
        return;
      }

      const provisional = this.isOpenAt(operatingRange.interval, asOf) || this.isOpenAt(usageRange.usage, asOf);
      attributions.push({
        operatingIntervalId: operatingRange.interval.id,
        usageId: usageRange.usage.id,
        ...intersection,
        durationMs: this.duration(intersection),
        isProvisional: provisional,
      });
      attributedRanges.push(intersection);
      isProvisional ||= provisional;
    };

    for (const event of events) {
      switch (event.type) {
        case 'operatingStart':
          for (const usageRange of activeUsageRanges) {
            addAttribution(event.range, usageRange);
          }
          activeOperatingRanges.add(event.range);
          break;
        case 'operatingEnd':
          activeOperatingRanges.delete(event.range);
          break;
        case 'usageStart':
          for (const operatingRange of activeOperatingRanges) {
            addAttribution(operatingRange, event.range);
          }
          activeUsageRanges.add(event.range);
          break;
        case 'usageEnd':
          activeUsageRanges.delete(event.range);
          break;
      }
    }

    const operatingDurationMs = operatingDataAvailable
      ? this.unionDuration(operatingRanges.map(({ range }) => range))
      : null;
    const attributedOperatingDurationMs = this.unionDuration(attributedRanges);
    return {
      asOf,
      windowStart: windowStart ?? null,
      sessionDurationMs: this.unionDuration(usageRanges.map(({ range }) => range)),
      operatingDataAvailable,
      operatingDurationMs,
      attributedOperatingDurationMs: operatingDataAvailable ? attributedOperatingDurationMs : null,
      unattributedOperatingDurationMs: operatingDataAvailable
        ? operatingDurationMs - attributedOperatingDurationMs
        : null,
      isOperating: operatingRanges.some(({ interval }) => this.isOpenAt(interval, asOf)),
      isProvisional: liveValuesMayChange && isProvisional,
      attributions,
    };
  }

  private toRange(
    interval: Pick<ResourceOperatingInterval | ResourceUsage, 'startTime' | 'endTime'>,
    asOf: Date,
    windowStart?: Date,
  ): TimeRange | null {
    const startTime = windowStart && interval.startTime < windowStart ? windowStart : interval.startTime;
    const endTime = !interval.endTime || interval.endTime > asOf ? asOf : interval.endTime;
    return startTime < endTime ? { startTime, endTime } : null;
  }

  private isOpenAt(interval: Pick<ResourceOperatingInterval | ResourceUsage, 'endTime'>, asOf: Date): boolean {
    return interval.endTime === null || interval.endTime > asOf;
  }

  private intersection(left: TimeRange, right: TimeRange): TimeRange | null {
    const startTime = left.startTime > right.startTime ? left.startTime : right.startTime;
    const endTime = left.endTime < right.endTime ? left.endTime : right.endTime;
    return startTime < endTime ? { startTime, endTime } : null;
  }

  private unionDuration(ranges: TimeRange[]): number {
    const sortedRanges = [...ranges].sort((left, right) => left.startTime.getTime() - right.startTime.getTime());
    let total = 0;
    let current: TimeRange | null = null;

    for (const range of sortedRanges) {
      if (!current || range.startTime > current.endTime) {
        total += current ? this.duration(current) : 0;
        current = { ...range };
      } else if (range.endTime > current.endTime) {
        current.endTime = range.endTime;
      }
    }

    return total + (current ? this.duration(current) : 0);
  }

  private duration(range: TimeRange): number {
    return range.endTime.getTime() - range.startTime.getTime();
  }
}
