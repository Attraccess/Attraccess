// Diagnostics over the authoritative machine operating timeline (ATT-1024).
// All views are derived directly from `resource_operating_interval` rows; there are no persisted
// aggregates yet, so verification recomputes derived durations from the timeline and compares.
import { ResourceFlowNode, ResourceOperatingInterval } from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThan, Repository } from 'typeorm';
import {
  OperatingDataQualityFailureKind,
  OperatingMetricsRecorder,
} from '../../metrics/instrumentation/operating/operating.helper';
import {
  OperatingDataQualityIssueDto,
  OperatingDataQualityReportDto,
  OperatingStateDto,
  OperatingTimelineVerificationDto,
  OperatingTransitionDto,
  OperatingTransitionPageDto,
} from './dtos/operating-diagnostics-response.dto';
import { verifyTimeline as verifyTimelineImplementation } from './operating-timeline-verification';
import { ResourceOperatingAttributionService } from './resource-operating-attribution.service';
import {
  DAY_MS,
  SAMPLE_LIMIT,
  STALE_SIGNAL_DAYS,
  TRACKING_NODE_TYPES,
} from './resource-operating-diagnostics.service.definitions';

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
      lastTransitionAt: latest ? (openInterval ? latest.startTime : (latest.endTime ?? latest.startTime)) : null,
    };
  }

  /**
   * Transition history derived directly from the authoritative interval rows: every interval
   * contributes an `operating` transition at its start and, once closed, an `idle` transition at
   * its end. Pagination is over interval rows, so a page holds up to `2 * limit` transitions.
   */
  async getTransitionHistory(resourceId: number, page: number, limit: number): Promise<OperatingTransitionPageDto> {
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
          flowNodeId: interval.startFlowNodeId ?? null,
          flowRunId: interval.startFlowRunId ?? null,
        },
      ];
      if (interval.endTime) {
        transitions.unshift({
          timestamp: interval.endTime,
          state: 'idle',
          intervalId: interval.id,
          source: 'flow-signal',
          flowNodeId: interval.endFlowNodeId ?? null,
          flowRunId: interval.endFlowRunId ?? null,
        });
      }
      return transitions;
    });
    // Interval rows are ordered newest-first, but a row's idle transition precedes the next row's
    // operating transition only by row order — sort the derived page to keep timestamps descending.
    items.sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());

    return { items, totalIntervals, page, limit };
  }

  async getDataQualityReport(resourceId: number, to = new Date()): Promise<OperatingDataQualityReportDto> {
    const from = new Date(to.getTime() - STALE_SIGNAL_DAYS * DAY_MS);
    const [trackingNodes, intervals, openCount] = await Promise.all([
      this.flowNodeRepository.count({ where: { resourceId, type: In(TRACKING_NODE_TYPES) } }),
      this.intervalRepository.find({
        where: [
          { resourceId, startTime: MoreThan(from) },
          { resourceId, endTime: MoreThan(from) },
        ],
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

    const negative = intervals.filter(
      (interval) => interval.endTime !== null && interval.endTime <= interval.startTime,
    );
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
    const getContextOwner = () => this;
    return verifyTimelineImplementation(
      {
        intervalRepository: getContextOwner().intervalRepository,
        attributionService: getContextOwner().attributionService,
      },
      resourceId,
      from,
      to,
    );
  }
}

export {
  DAY_MS,
  SAMPLE_LIMIT,
  STALE_SIGNAL_DAYS,
  TRACKING_NODE_TYPES,
  unionDurationMs,
} from './resource-operating-diagnostics.service.definitions';
