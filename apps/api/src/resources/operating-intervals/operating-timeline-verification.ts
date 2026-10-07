// Diagnostics over the authoritative machine operating timeline (ATT-1024).
// All views are derived directly from `resource_operating_interval` rows; there are no persisted
// aggregates yet, so verification recomputes derived durations from the timeline and compares.

import { IsNull, LessThan, MoreThan } from 'typeorm';
import {
  OperatingTimelineVerificationCheckDto,
  OperatingTimelineVerificationDto,
} from './dtos/operating-diagnostics-response.dto';
import type { ResourceOperatingDiagnosticsService } from './resource-operating-diagnostics.service';
import { unionDurationMs } from './resource-operating-diagnostics.service.definitions';

interface ResourceOperatingDiagnosticsServiceOperatingTimelineVerificationContext {
  intervalRepository: ResourceOperatingDiagnosticsService['intervalRepository'];
  attributionService: ResourceOperatingDiagnosticsService['attributionService'];
}
export async function verifyTimeline(
  context: ResourceOperatingDiagnosticsServiceOperatingTimelineVerificationContext,
  resourceId: number,
  from: Date,
  to: Date,
): Promise<OperatingTimelineVerificationDto> {
  const intervals = await context.intervalRepository.find({
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

  const summary = await context.attributionService.getForResource(resourceId, to, from);

  // ATT-1027 semantics: null durations mean "operating data unavailable" (the resource never
  // produced an interval row), which is distinct from a measured 0. Verification leans on that:
  // an unavailable view is consistent exactly when the timeline recomputes to zero.
  const { operatingDataAvailable } = summary;
  const reported = summary.operatingDurationMs;
  const attributed = summary.attributedOperatingDurationMs;
  const unattributed = summary.unattributedOperatingDurationMs;

  const operatingMatches = operatingDataAvailable
    ? recomputedOperatingDurationMs === reported
    : reported === null && recomputedOperatingDurationMs === 0;
  const partitionMatches = operatingDataAvailable
    ? attributed !== null && unattributed !== null && reported !== null && attributed + unattributed === reported
    : attributed === null && unattributed === null;
  const withinMatches = operatingDataAvailable
    ? attributed !== null && reported !== null && attributed <= reported
    : attributed === null;

  const checks: OperatingTimelineVerificationCheckDto[] = [
    {
      name: 'operating-duration-matches',
      passed: operatingMatches,
      detail: operatingMatches
        ? null
        : `Recomputed ${recomputedOperatingDurationMs}ms from ${intervals.length} interval rows, derived view reports ${reported === null ? 'unavailable' : `${reported}ms`}`,
    },
    {
      name: 'attribution-partition-matches',
      passed: partitionMatches,
      detail: partitionMatches
        ? null
        : `Attributed ${attributed}ms + unattributed ${unattributed}ms != operating ${reported}ms`,
    },
    {
      name: 'attributions-within-operating-duration',
      passed: withinMatches,
      detail: withinMatches ? null : `Attributed ${attributed}ms exceeds operating ${reported}ms`,
    },
  ];

  return {
    resourceId,
    from,
    to,
    consistent: checks.every((check) => check.passed),
    recomputedOperatingDurationMs,
    operatingDataAvailable,
    reportedOperatingDurationMs: reported,
    reportedAttributedDurationMs: attributed,
    reportedUnattributedDurationMs: unattributed,
    intervalCount: intervals.length,
    aggregatesPresent: false,
    note: 'No persisted aggregates exist; derived views are computed directly from the authoritative interval rows and verified against them.',
    checks,
  };
}
