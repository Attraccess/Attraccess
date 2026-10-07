import { ResourceOperatingInterval, ResourceUsage, ResourceUsageAction } from '@attraccess/database-entities';
import { OperatingUsageAttributionImplementation } from './operating-usage-attribution';
import {
  OperatingRange,
  ResourceOperatingAttribution,
  ResourceOperatingAttributionSummary,
  SweepEvent,
  TimeRange,
  UsageRange,
} from './resource-operating-attribution.service.feature-definitions';
export abstract class OperatingRangeAttributionImplementation extends OperatingUsageAttributionImplementation {
  derive(
    operatingIntervals: ResourceOperatingInterval[],
    usages: ResourceUsage[],
    asOf = new Date(),
    windowStart?: Date,
    operatingDataAvailable = operatingIntervals.length > 0,
    liveValuesMayChange = true,
    pendingSessionEnds = new Map<number, Date>(),
  ): ResourceOperatingAttributionSummary {
    const attributions: ResourceOperatingAttribution[] = [];
    const attributedRanges: TimeRange[] = [];
    const operatingRanges = operatingIntervals
      .map((interval) => ({ interval, range: this.toRange(interval, asOf, windowStart) }))
      .filter((entry): entry is OperatingRange => entry.range !== null);
    const usageRanges = usages
      .filter((usage) => usage.usageAction === ResourceUsageAction.Usage && !usage.lifecyclePending)
      .map((usage) => ({ usage, range: this.toUsageRange(usage, asOf, windowStart, pendingSessionEnds) }))
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
      usages.some((usage) => usage.endTime === null && pendingSessionEnds.has(usage.id) && usage.startTime < asOf) ||
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

  protected toRange(
    interval: Pick<ResourceOperatingInterval | ResourceUsage, 'startTime' | 'endTime'>,
    asOf: Date,
    windowStart?: Date,
  ): TimeRange | null {
    const startTime = windowStart && interval.startTime < windowStart ? windowStart : interval.startTime;
    const endTime = !interval.endTime || interval.endTime > asOf ? asOf : interval.endTime;
    return startTime < endTime ? { startTime, endTime } : null;
  }

  protected toUsageRange(
    usage: Pick<ResourceUsage, 'id' | 'startTime' | 'endTime'>,
    asOf: Date,
    windowStart: Date | undefined,
    pendingSessionEnds: Map<number, Date>,
  ): TimeRange | null {
    const pendingEnd = pendingSessionEnds.get(usage.id);
    return this.toRange(
      usage.endTime === null && pendingEnd ? { ...usage, endTime: pendingEnd } : usage,
      asOf,
      windowStart,
    );
  }

  protected isOpenAt(interval: Pick<ResourceOperatingInterval | ResourceUsage, 'endTime'>, asOf: Date): boolean {
    return interval.endTime === null || interval.endTime > asOf;
  }

  protected intersection(left: TimeRange, right: TimeRange): TimeRange | null {
    const startTime = left.startTime > right.startTime ? left.startTime : right.startTime;
    const endTime = left.endTime < right.endTime ? left.endTime : right.endTime;
    return startTime < endTime ? { startTime, endTime } : null;
  }

  protected unionDuration(ranges: TimeRange[]): number {
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

  protected duration(range: TimeRange): number {
    return range.endTime.getTime() - range.startTime.getTime();
  }
}
