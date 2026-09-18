// Diagnostics over the authoritative machine operating timeline (ATT-1024).
// All views are derived directly from `resource_operating_interval` rows; there are no persisted
// aggregates yet, so verification recomputes derived durations from the timeline and compares.
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceOperatingInterval,
} from '@attraccess/database-entities';
import { In, IsNull, LessThan, MoreThan, Repository } from 'typeorm';
import {
  OperatingDataQualityFailureKind,
  OperatingMetricsRecorder,
} from '../../metrics/instrumentation/operating/operating.helper';
import {
  ResourceOperatingAttributionService,
  ResourceOperatingAttributionSummary,
} from './resource-operating-attribution.service';
import {
  OperatingDataQualityIssueDto,
  OperatingDataQualityReportDto,
  OperatingStateDto,
  OperatingTimelineVerificationCheckDto,
  OperatingTimelineVerificationDto,
  OperatingTransitionDto,
  OperatingTransitionPageDto,
} from './dtos/operating-diagnostics-response.dto';

/** A resource with tracking configured but no transition for this long is reported as stale. */
const STALE_SIGNAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60_000;
const SAMPLE_LIMIT = 10;
const TRACKING_NODE_TYPES = [
  ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_OPERATING,
  ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_IDLE,
];

@Injectable()
export class ResourceOperatingDiagnosticsService {
  constructor(
    @InjectRepository(ResourceOperatingInterval)
    private readonly intervalRepository: Repository<ResourceOperatingInterval>,
    @InjectRepository(ResourceFlowNode)
    private readonly flowNodeRepository: Repository<ResourceFlowNode>,
    private readonly attributionService: ResourceOperatingAttributionService,
    private readonly operatingMetrics: OperatingMetricsRecorder,
  ) {}

  async getCurrentState(resourceId: number): Promise<OperatingStateDto> {
    const [openInterval, latest] = await Promise.all([
      this.intervalRepository.findOne({ where: { resourceId, endTime: IsNull() } }),
      this.intervalRepository.findOne({ where: { resourceId }, order: { startTime: 'DESC' } }),
    ]);

    return {
      state: openInterval ? 'operating' : 'idle',
      openInterval: openInterval ? { id: openInterval.id, startTime: openInterval.startTime } : null,
      lastTransitionAt: latest
        ? (openInterval
            ? latest.startTime
            : (latest.endTime ?? latest.startTime))
        : null,
    };
  }

  /**
   * Transition history derived directly from the authoritative interval rows: every interval
   * contributes an `operating` transition at its start and, once closed, an `idle` transition at
   * its end. Pagination is over interval rows, so a page holds up to `2 * limit` transitions.
   */
  async getTransitionHistory(
    resourceId: number,
    page: number,
    limit: number,
  ): Promise<OperatingTransitionPageDto> {
    const [intervals, totalIntervals] = await this.intervalRepository.findAndCount({
      where: { resourceId },
      order: { startTime: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const items: OperatingTransitionDto[] = intervals.flatMap((interval) => {
      const transitions: OperatingTransitionDto[] = [
        {
          timestamp: interval.startTime,
          state: 'operating',
          intervalId: interval.id,
          source: 'flow-signal',
        },
      ];
      if (interval.endTime) {
        transitions.unshift({
          timestamp: interval.endTime,
          state: 'idle',
          intervalId: interval.id,
          source: 'flow-signal',
        });
      }
      return transitions;
    });
    // Interval rows are ordered newest-first, but a row's idle transition precedes the next row's
    // operating transition only by row order — sort the derived page to keep timestamps descending.
    items.sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());

    return { items, totalIntervals, page, limit };
  }

  /** Unattributed operation for an explicit range — a thin pass-through to the ATT-1025 attribution logic. */
  async getUnattributedSummary(
    resourceId: number,
    from: Date,
    to: Date,
  ): Promise<ResourceOperatingAttributionSummary> {
    return this.attributionService.getForResourceRange(resourceId, from, to);
  }

  async getDataQualityReport(resourceId: number, to = new Date()): Promise<OperatingDataQualityReportDto> {
    const from = new Date(to.getTime() - STALE_SIGNAL_DAYS * DAY_MS);
    const [trackingNodes, intervals, openCount] = await Promise.all([
      this.flowNodeRepository.count({ where: { resourceId, type: In(TRACKING_NODE_TYPES) } }),
      this.intervalRepository.find({
        where: [{ resourceId, startTime: MoreThan(from) }, { resourceId, endTime: MoreThan(from) }],
        order: { startTime: 'ASC' },
      }),
      this.intervalRepository.count({ where: { resourceId, endTime: IsNull() } }),
    ]);
    const trackingConfigured = trackingNodes > 0;

    const issues: (OperatingDataQualityIssueDto & { kind: OperatingDataQualityFailureKind })[] = [];

    // An interval opened before the window and still running is a live signal, not a stale one.
    if (trackingConfigured && intervals.length === 0 && openCount === 0) {
      issues.push({
        kind: 'stale-signal',
        count: 1,
        message: `Operating tracking is configured but no transition was recorded in the last ${STALE_SIGNAL_DAYS} days`,
        intervalIds: [],
      });
    }

    const overlapping = intervals.filter(
      (interval, index) => index > 0 && interval.startTime < (intervals[index - 1].endTime ?? interval.startTime),
    );
    if (overlapping.length > 0) {
      issues.push({
        kind: 'overlapping-intervals',
        count: overlapping.length,
        message: 'Intervals overlap: a transition arrived out of order or was duplicated',
        intervalIds: overlapping.slice(0, SAMPLE_LIMIT).map((interval) => interval.id),
      });
    }

    const negative = intervals.filter((interval) => interval.endTime !== null && interval.endTime <= interval.startTime);
    if (negative.length > 0) {
      issues.push({
        kind: 'negative-duration',
        count: negative.length,
        message: 'Closed intervals whose end is not after their start',
        intervalIds: negative.slice(0, SAMPLE_LIMIT).map((interval) => interval.id),
      });
    }

    if (openCount > 1) {
      issues.push({
        kind: 'multiple-open-intervals',
        count: openCount,
        message: 'More than one open interval exists although the unique index allows only one',
        intervalIds: [],
      });
    }

    for (const issue of issues) {
      this.operatingMetrics.recordDataQualityFailures(issue.kind, issue.count);
    }

    return { from, to, trackingConfigured, issues };
  }

  /**
   * Recomputes operating duration directly from the authoritative interval rows for [from, to] and
   * compares it against the derived attribution view. There are no persisted aggregates yet
   * (ATT-1024 keeps views derived), so verification covers the derived view; the response says so.
   */
  async verifyTimeline(resourceId: number, from: Date, to: Date): Promise<OperatingTimelineVerificationDto> {
    const intervals = await this.intervalRepository.find({
      where: [
        { resourceId, startTime: LessThan(to), endTime: IsNull() },
        { resourceId, startTime: LessThan(to), endTime: MoreThan(from) },
      ],
      order: { startTime: 'ASC' },
    });

    const recomputedOperatingDurationMs = unionDurationMs(
      intervals.map((interval) => ({
        start: Math.max(interval.startTime.getTime(), from.getTime()),
        end: Math.min((interval.endTime ?? to).getTime(), to.getTime()),
      })),
    );

    const summary = await this.attributionService.getForResourceRange(resourceId, from, to);

    const checks: OperatingTimelineVerificationCheckDto[] = [
      {
        name: 'operating-duration-matches',
        passed: recomputedOperatingDurationMs === summary.operatingDurationMs,
        detail:
          recomputedOperatingDurationMs === summary.operatingDurationMs
            ? null
            : `Recomputed ${recomputedOperatingDurationMs}ms from ${intervals.length} interval rows, derived view reports ${summary.operatingDurationMs}ms`,
      },
      {
        name: 'attribution-partition-matches',
        passed:
          summary.attributedOperatingDurationMs + summary.unattributedOperatingDurationMs ===
          summary.operatingDurationMs,
        detail:
          summary.attributedOperatingDurationMs + summary.unattributedOperatingDurationMs ===
          summary.operatingDurationMs
            ? null
            : `Attributed ${summary.attributedOperatingDurationMs}ms + unattributed ${summary.unattributedOperatingDurationMs}ms != operating ${summary.operatingDurationMs}ms`,
      },
      {
        name: 'attributions-within-operating-duration',
        passed: summary.attributedOperatingDurationMs <= summary.operatingDurationMs,
        detail:
          summary.attributedOperatingDurationMs <= summary.operatingDurationMs
            ? null
            : `Attributed ${summary.attributedOperatingDurationMs}ms exceeds operating ${summary.operatingDurationMs}ms`,
      },
    ];

    return {
      resourceId,
      from,
      to,
      consistent: checks.every((check) => check.passed),
      recomputedOperatingDurationMs,
      reportedOperatingDurationMs: summary.operatingDurationMs,
      reportedAttributedDurationMs: summary.attributedOperatingDurationMs,
      reportedUnattributedDurationMs: summary.unattributedOperatingDurationMs,
      intervalCount: intervals.length,
      aggregatesPresent: false,
      note: 'No persisted aggregates exist; derived views are computed directly from the authoritative interval rows and verified against them.',
      checks,
    };
  }
}

/** Total length of the union of [start, end) ranges, ignoring empty or inverted ranges. */
export function unionDurationMs(ranges: { start: number; end: number }[]): number {
  const sorted = ranges.filter((range) => range.end > range.start).sort((left, right) => left.start - right.start);
  let total = 0;
  let cursor: number | null = null;
  let currentEnd: number | null = null;

  for (const range of sorted) {
    if (cursor === null || currentEnd === null || range.start >= currentEnd) {
      if (cursor !== null && currentEnd !== null) {
        total += currentEnd - cursor;
      }
      cursor = range.start;
      currentEnd = range.end;
    } else if (range.end > currentEnd) {
      currentEnd = range.end;
    }
  }

  if (cursor !== null && currentEnd !== null) {
    total += currentEnd - cursor;
  }
  return total;
}
