import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResourceOperatingInterval, ResourceUsage, ResourceUsageAction } from '@attraccess/database-entities';
import { IsNull, LessThan, MoreThan, Repository } from 'typeorm';

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
  operatingDurationMs: number;
  attributedOperatingDurationMs: number;
  unattributedOperatingDurationMs: number;
  isProvisional: boolean;
  attributions: ResourceOperatingAttribution[];
}

interface TimeRange {
  startTime: Date;
  endTime: Date;
}

@Injectable()
export class ResourceOperatingAttributionService {
  constructor(
    @InjectRepository(ResourceOperatingInterval)
    private readonly intervalRepository: Repository<ResourceOperatingInterval>,
    @InjectRepository(ResourceUsage)
    private readonly usageRepository: Repository<ResourceUsage>,
  ) {}

  async getForResource(resourceId: number, asOf = new Date()): Promise<ResourceOperatingAttributionSummary> {
    const windowStart = new Date(asOf.getTime() - ATTRIBUTION_LOOKBACK_MS);
    const [operatingIntervals, usages] = await Promise.all([
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
    ]);

    return this.derive(operatingIntervals, usages, asOf, windowStart);
  }

  derive(
    operatingIntervals: ResourceOperatingInterval[],
    usages: ResourceUsage[],
    asOf = new Date(),
    windowStart?: Date,
  ): ResourceOperatingAttributionSummary {
    const attributions: ResourceOperatingAttribution[] = [];
    const attributedRanges: TimeRange[] = [];
    const operatingRanges = operatingIntervals
      .map((interval) => ({ interval, range: this.toRange(interval, asOf, windowStart) }))
      .filter((entry): entry is { interval: ResourceOperatingInterval; range: TimeRange } => entry.range !== null)
      .sort((left, right) => left.range.startTime.getTime() - right.range.startTime.getTime());
    const usageRanges = usages
      .filter((usage) => usage.usageAction === ResourceUsageAction.Usage)
      .map((usage) => ({ usage, range: this.toRange(usage, asOf, windowStart) }))
      .filter((entry): entry is { usage: ResourceUsage; range: TimeRange } => entry.range !== null)
      .sort((left, right) => left.range.startTime.getTime() - right.range.startTime.getTime());
    let isProvisional = false;
    let usageIndex = 0;

    for (const { interval: operatingInterval, range: operatingRange } of operatingRanges) {
      isProvisional ||= this.isOpenAt(operatingInterval, asOf);

      while (usageRanges[usageIndex]?.range.endTime <= operatingRange.startTime) {
        usageIndex++;
      }

      // Every range visited below produces an attribution, so work grows with the response size.
      for (let index = usageIndex; index < usageRanges.length; index++) {
        const { usage, range: usageRange } = usageRanges[index];
        if (usageRange.startTime >= operatingRange.endTime) {
          break;
        }
        const intersection = this.intersection(operatingRange, usageRange);
        if (!intersection) {
          continue;
        }

        const provisional = this.isOpenAt(operatingInterval, asOf) || this.isOpenAt(usage, asOf);
        attributions.push({
          operatingIntervalId: operatingInterval.id,
          usageId: usage.id,
          ...intersection,
          durationMs: this.duration(intersection),
          isProvisional: provisional,
        });
        attributedRanges.push(intersection);
        isProvisional ||= provisional;
      }
    }

    const operatingDurationMs = this.unionDuration(operatingRanges.map(({ range }) => range));
    const attributedOperatingDurationMs = this.unionDuration(attributedRanges);
    return {
      asOf,
      operatingDurationMs,
      attributedOperatingDurationMs,
      unattributedOperatingDurationMs: operatingDurationMs - attributedOperatingDurationMs,
      isProvisional,
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
