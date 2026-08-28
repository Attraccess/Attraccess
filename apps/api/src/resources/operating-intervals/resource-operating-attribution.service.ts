import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResourceOperatingInterval, ResourceUsage, ResourceUsageAction } from '@attraccess/database-entities';
import { Repository } from 'typeorm';

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
    const [operatingIntervals, usages] = await Promise.all([
      this.intervalRepository.find({ where: { resourceId }, order: { startTime: 'ASC' } }),
      this.usageRepository.find({
        where: { resourceId, usageAction: ResourceUsageAction.Usage },
        order: { startTime: 'ASC' },
      }),
    ]);

    return this.derive(operatingIntervals, usages, asOf);
  }

  derive(
    operatingIntervals: ResourceOperatingInterval[],
    usages: ResourceUsage[],
    asOf = new Date(),
  ): ResourceOperatingAttributionSummary {
    const attributions: ResourceOperatingAttribution[] = [];
    const attributedRanges: TimeRange[] = [];
    const operatingRanges: TimeRange[] = [];
    let isProvisional = false;

    for (const operatingInterval of operatingIntervals) {
      const operatingRange = this.toRange(operatingInterval, asOf);
      if (!operatingRange) {
        continue;
      }

      operatingRanges.push(operatingRange);
      isProvisional ||= operatingInterval.endTime === null;

      for (const usage of usages) {
        if (usage.usageAction !== ResourceUsageAction.Usage) {
          continue;
        }
        const usageRange = this.toRange(usage, asOf);
        if (!usageRange) {
          continue;
        }

        const intersection = this.intersection(operatingRange, usageRange);
        if (!intersection) {
          continue;
        }

        const provisional = operatingInterval.endTime === null || usage.endTime === null;
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

    const operatingDurationMs = this.unionDuration(operatingRanges);
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
  ): TimeRange | null {
    const endTime = interval.endTime ?? asOf;
    return interval.startTime < endTime ? { startTime: interval.startTime, endTime } : null;
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
