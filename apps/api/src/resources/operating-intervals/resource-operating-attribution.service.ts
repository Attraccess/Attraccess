import {
  ResourceOperatingInterval,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
  ResourceUsageAction,
} from '@attraccess/database-entities';

import { Injectable } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository, EntityManager, In, IsNull, LessThan, MoreThan, Not } from 'typeorm';

import { computeOperatingShare, OperatingShare, ShareUsage } from './operating-share';

export const ATTRIBUTION_LOOKBACK_MS = 31 * 24 * 60 * 60_000;

export const groupByResourceId = <T extends { resourceId: number }>(items: T[]): Map<number, T[]> => {
  const grouped = new Map<number, T[]>();
  for (const item of items) {
    const resourceItems = grouped.get(item.resourceId) ?? [];
    resourceItems.push(item);
    grouped.set(item.resourceId, resourceItems);
  }
  return grouped;
};

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

export interface TimeRange {
  startTime: Date;
  endTime: Date;
}

export interface ResourceDurationWindow {
  key: string;
  resourceId: number;
  start: Date;
}

export interface ResourceDurations {
  sessionDurationMs: number;
  operatingDurationMs: number;
}

export interface SessionSegments {
  spans: { start: number; end: number; sessions: number; before: number }[];
}

export interface OperatingRange {
  interval: ResourceOperatingInterval;
  range: TimeRange;
}

export interface UsageRange {
  usage: ResourceUsage;
  range: TimeRange;
}

@Injectable()
export class ResourceOperatingAttributionService {
  constructor(
    @InjectRepository(ResourceOperatingInterval)
    protected readonly intervalRepository: Repository<ResourceOperatingInterval>,
    @InjectRepository(ResourceUsage)
    protected readonly usageRepository: Repository<ResourceUsage>,
    @InjectRepository(ResourceUsageLifecycleAttempt)
    protected readonly lifecycleAttemptRepository: Repository<ResourceUsageLifecycleAttempt>,
  ) {}

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
    // Sessions running at the same time split the running time they share equally (ATT-1191): every start and end
    // of a session closes a segment, and each operating interval's part inside it is shared by the segment's sessions.
    const segments = this.sessionSegments(usageRanges);
    let isProvisional =
      usages.some((usage) => usage.endTime === null && pendingSessionEnds.has(usage.id) && usage.startTime < asOf) ||
      operatingRanges.some(({ interval }) => this.isOpenAt(interval, asOf)) ||
      usageRanges.some(({ usage }) => this.isOpenAt(usage, asOf));
    const sortedUsageRanges = [...usageRanges].sort(
      (left, right) => left.range.startTime.getTime() - right.range.startTime.getTime(),
    );
    for (const operatingRange of operatingRanges) {
      for (const usageRange of sortedUsageRanges) {
        if (usageRange.range.startTime >= operatingRange.range.endTime) break;
        if (usageRange.range.endTime <= operatingRange.range.startTime) continue;
        const intersection = this.intersection(operatingRange.range, usageRange.range);
        if (!intersection) continue;
        const provisional = this.isOpenAt(operatingRange.interval, asOf) || this.isOpenAt(usageRange.usage, asOf);
        attributions.push({
          operatingIntervalId: operatingRange.interval.id,
          usageId: usageRange.usage.id,
          ...intersection,
          durationMs: this.sharedDuration(segments, intersection),
          isProvisional: provisional,
        });
        attributedRanges.push(intersection);
        isProvisional ||= provisional;
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

  /**
   * The spans in which the same sessions are active, with how many are, covering every moment any is. `shared` holds
   * the time each span's sessions would be charged for it so far, as a running sum of each span's length per session.
   */
  protected sessionSegments(usageRanges: UsageRange[]): SessionSegments {
    const changes = new Map<number, number>();
    for (const { range } of usageRanges) {
      changes.set(range.startTime.getTime(), (changes.get(range.startTime.getTime()) ?? 0) + 1);
      changes.set(range.endTime.getTime(), (changes.get(range.endTime.getTime()) ?? 0) - 1);
    }
    const times = [...changes.keys()].sort((left, right) => left - right);
    const spans: SessionSegments['spans'] = [];
    let sessions = 0;
    let shared = 0;
    times.forEach((time, index) => {
      sessions += changes.get(time) ?? 0;
      if (sessions > 0 && index + 1 < times.length) {
        spans.push({ start: time, end: times[index + 1], sessions, before: shared });
        shared += (times[index + 1] - time) / sessions;
      }
    });
    return { spans };
  }

  /** A session's equal share of the time inside `range`, which lies within the sessions' span. */
  protected sharedDuration({ spans }: SessionSegments, range: TimeRange): number {
    const position = (time: number): number => {
      let low = 0;
      let high = spans.length;
      while (low < high) {
        const middle = (low + high) >> 1;
        if (spans[middle].end <= time) low = middle + 1;
        else high = middle;
      }
      const span = spans[low];
      if (!span)
        return spans.length
          ? spans[spans.length - 1].before +
              (spans[spans.length - 1].end - spans[spans.length - 1].start) / spans[spans.length - 1].sessions
          : 0;
      return span.before + Math.max(0, time - span.start) / span.sessions;
    };
    return position(range.endTime.getTime()) - position(range.startTime.getTime());
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

  async getForResource(
    resourceId: number,
    asOf = new Date(),
    windowStart = new Date(asOf.getTime() - ATTRIBUTION_LOOKBACK_MS),
  ): Promise<ResourceOperatingAttributionSummary> {
    const [operatingIntervals, usages, operatingDataAvailable, pendingSessionEnds] = await Promise.all([
      this.intervalRepository.find({
        where: [
          { resourceId, startTime: LessThan(asOf), endTime: IsNull() },
          { resourceId, startTime: LessThan(asOf), endTime: MoreThan(windowStart) },
        ],
        order: { startTime: 'ASC' },
      }),
      this.usageRepository.find({
        where: [
          {
            resourceId,
            usageAction: ResourceUsageAction.Usage,
            lifecyclePending: false,
            startTime: LessThan(asOf),
            endTime: IsNull(),
          },
          {
            resourceId,
            usageAction: ResourceUsageAction.Usage,
            lifecyclePending: false,
            startTime: LessThan(asOf),
            endTime: MoreThan(windowStart),
          },
        ],
        order: { startTime: 'ASC' },
      }),
      this.intervalRepository.existsBy({ resourceId }),
      this.getPendingSessionEnds([resourceId]),
    ]);

    return this.derive(operatingIntervals, usages, asOf, windowStart, operatingDataAvailable, true, pendingSessionEnds);
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

    const [operatingIntervals, usages, resourcesWithOperatingData, pendingSessionEnds] = await Promise.all([
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
            lifecyclePending: false,
            startTime: LessThan(asOf),
            endTime: IsNull(),
          },
          {
            resourceId: In(uniqueResourceIds),
            usageAction: ResourceUsageAction.Usage,
            lifecyclePending: false,
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
      this.getPendingSessionEnds(uniqueResourceIds),
    ]);
    const availableResourceIds = new Set(resourcesWithOperatingData.map(({ resourceId }) => resourceId));
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
          pendingSessionEnds,
        ),
      ]),
    );
  }

  /**
   * The running time charged to a usage when it ends, in minutes. A session that never overlapped another is
   * charged exactly its operating time. A session that shared the machine is charged its equal share of each
   * segment, so `getShareForUsage` carries the rest of the story.
   */
  async getForUsage(usage: ResourceUsage, manager: EntityManager): Promise<number> {
    const share = await this.getShareForUsage(usage, manager);
    return share ? share.shareMs / 60_000 : 0;
  }

  /** The usage's running time split among the sessions it shared the machine with; null until it has ended. */
  async getShareForUsage(usage: ResourceUsage, manager: EntityManager): Promise<OperatingShare | null> {
    if (!usage.endTime) {
      return null;
    }

    const intervals = await manager.getRepository(ResourceOperatingInterval).find({
      where: [
        { resourceId: usage.resourceId, startTime: LessThan(usage.endTime), endTime: IsNull() },
        { resourceId: usage.resourceId, startTime: LessThan(usage.endTime), endTime: MoreThan(usage.startTime) },
      ],
      order: { startTime: 'ASC' },
    });
    const overlapping = await manager.getRepository(ResourceUsage).find({
      where: [
        {
          resourceId: usage.resourceId,
          usageAction: ResourceUsageAction.Usage,
          lifecyclePending: false,
          id: Not(usage.id),
          startTime: LessThan(usage.endTime),
          endTime: IsNull(),
        },
        {
          resourceId: usage.resourceId,
          usageAction: ResourceUsageAction.Usage,
          lifecyclePending: false,
          id: Not(usage.id),
          startTime: LessThan(usage.endTime),
          endTime: MoreThan(usage.startTime),
        },
      ],
    });
    return computeOperatingShare(
      usage as ShareUsage & { endTime: Date },
      overlapping,
      intervals,
      overlapping.length ? await this.getPendingSessionEnds([usage.resourceId], manager) : undefined,
    );
  }

  protected async getPendingSessionEnds(resourceIds: number[], manager?: EntityManager): Promise<Map<number, Date>> {
    const attempts = await (
      manager?.getRepository(ResourceUsageLifecycleAttempt) ?? this.lifecycleAttemptRepository
    ).find({
      where: { resourceId: In(resourceIds), kind: In(['end', 'takeover']) },
      select: ['previousUsageId', 'transitionTime'],
    });
    return new Map(
      attempts.flatMap((attempt) =>
        attempt.previousUsageId === null ? [] : [[attempt.previousUsageId, attempt.transitionTime] as const],
      ),
    );
  }

  /** Exact duration totals for independent service cycles, without deriving user attributions. */
  async getDurationsForWindows(
    windows: ResourceDurationWindow[],
    asOf: Date,
    manager?: EntityManager,
  ): Promise<Map<string, ResourceDurations>> {
    const result = new Map<string, ResourceDurations>();
    const windowsByResource = new Map<number, ResourceDurationWindow[]>();
    for (const window of windows) {
      const resourceWindows = windowsByResource.get(window.resourceId) ?? [];
      resourceWindows.push(window);
      windowsByResource.set(window.resourceId, resourceWindows);
    }
    const resourceIds = [...windowsByResource.keys()];
    const intervalRepository = manager?.getRepository(ResourceOperatingInterval) ?? this.intervalRepository;
    const usageRepository = manager?.getRepository(ResourceUsage) ?? this.usageRepository;

    // Each resource gets its own oldest requested boundary. Sharing a boundary across a batch
    // would load an unbounded history for unrelated resources with newer service cycles.
    for (let offset = 0; offset < resourceIds.length; offset += 150) {
      const batchIds = resourceIds.slice(offset, offset + 150);
      const batchWindows = batchIds.flatMap((id) => windowsByResource.get(id) ?? []);
      const where = batchIds.flatMap((resourceId) => {
        const start = new Date(
          Math.min(...(windowsByResource.get(resourceId) ?? []).map((window) => window.start.getTime())),
        );
        return [
          { resourceId, startTime: LessThan(asOf), endTime: IsNull() },
          { resourceId, startTime: LessThan(asOf), endTime: MoreThan(start) },
        ];
      });
      const [intervals, usages, pendingSessionEnds] = await Promise.all([
        intervalRepository.find({ where, select: ['resourceId', 'startTime', 'endTime'] }),
        usageRepository.find({
          where: where.map((condition) => ({
            ...condition,
            usageAction: ResourceUsageAction.Usage,
            lifecyclePending: false,
          })),
          select: ['id', 'resourceId', 'startTime', 'endTime'],
        }),
        this.getPendingSessionEnds(batchIds, manager),
      ]);
      const intervalsByResource = groupByResourceId(intervals);
      const usagesByResource = groupByResourceId(usages);
      for (const window of batchWindows) {
        const duration = (rows: Array<Pick<ResourceUsage, 'startTime' | 'endTime'>>) =>
          this.unionDuration(
            rows
              .map((row) => this.toRange(row, asOf, window.start))
              .filter((range): range is TimeRange => range !== null),
          );
        result.set(window.key, {
          sessionDurationMs: this.unionDuration(
            (usagesByResource.get(window.resourceId) ?? [])
              .map((usage) => this.toUsageRange(usage, asOf, window.start, pendingSessionEnds))
              .filter((range): range is TimeRange => range !== null),
          ),
          operatingDurationMs: duration(intervalsByResource.get(window.resourceId) ?? []),
        });
      }
    }
    return result;
  }
}
