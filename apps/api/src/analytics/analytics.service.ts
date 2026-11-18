import { Inject, Injectable } from '@nestjs/common';
import { DateRangeValue } from './dtos/dateRangeValue';
import { ResourceUsageAction } from '@attraccess/application-models';
import { ANALYTICS_READER, AnalyticsReader, ResourceHoursRangeParams } from './analytics-reader.port';
import { ResourceHoursSummaryRowDto } from './dtos/resourceHoursSummary.dto';
import { MAX_REPORT_DURATION_MS, MAX_RESOURCE_IDS_PER_REPORT } from './dtos/resourceOperatingDurations.dto';
import {
  ResourceOperatingAttributionService,
  ResourceOperatingAttributionSummary,
} from '../resources/operating-intervals/resource-operating-attribution.service';

type ResourceHours = Pick<
  ResourceHoursSummaryRowDto,
  | 'personDurationMs'
  | 'sessionDurationMs'
  | 'operatingDataAvailable'
  | 'operatingDurationMs'
  | 'unattributedOperatingDurationMs'
>;

const NO_HOURS: ResourceHours = {
  personDurationMs: 0,
  sessionDurationMs: 0,
  operatingDataAvailable: false,
  operatingDurationMs: null,
  unattributedOperatingDurationMs: null,
};

@Injectable()
export class AnalyticsService {
  public constructor(
    @Inject(ANALYTICS_READER) private readonly reader: AnalyticsReader,
    private readonly operatingAttributionService: ResourceOperatingAttributionService,
  ) {}

  public async getResourceUsageHoursInDateRange(dateRange: DateRangeValue, page = 1, limit = 500) {
    const { rows, total } = await this.reader.findUsagesStartedInRange(dateRange, page, limit);
    return [rows, total] as const;
  }

  public async getBillingTransactionsInDateRange(
    dateRange: DateRangeValue,
    page = 1,
    limit = 500,
    includeEmail = false,
  ) {
    const { rows, total } = await this.reader.findBillingTransactionsInRange(dateRange, page, limit, includeEmail);
    return [rows, total] as const;
  }

  public async getResourceOperatingDurations(
    resourceIds: number[],
    dateRange: DateRangeValue,
  ): Promise<Record<number, ResourceOperatingAttributionSummary>> {
    const now = new Date();
    const asOf = new Date(Math.min(dateRange.end.getTime(), now.getTime()));
    const liveValuesMayChange = dateRange.end.getTime() >= now.getTime();

    return Object.fromEntries(
      await this.operatingAttributionService.getForResources(resourceIds, dateRange.start, asOf, liveValuesMayChange),
    );
  }

  /**
   * One row per resource with a usage session or an operating interval overlapping the range, ordered by resource
   * id and paginated over resources. Durations are clipped to [start, min(end, now)], like the operating durations.
   */
  public async getResourceHoursSummaryInDateRange(
    dateRange: DateRangeValue,
    page = 1,
    limit = 500,
  ): Promise<readonly [ResourceHoursSummaryRowDto[], number]> {
    const now = new Date();
    const asOf = new Date(Math.min(dateRange.end.getTime(), now.getTime()));
    if (asOf <= dateRange.start) {
      return [[], 0] as const;
    }

    const params: ResourceHoursRangeParams = {
      start: dateRange.start,
      asOf,
      action: ResourceUsageAction.Usage,
      pending: false,
    };
    const { resources, total } = await this.reader.findResourcesActiveInRange(params, page, limit);
    const resourceIds = resources.map(({ id }) => id);
    if (resourceIds.length === 0) {
      return [[], total] as const;
    }

    const sessionsByResourceId = await this.reader.countSessionsInRange(resourceIds, params);
    const hoursByResourceId = await this.sumHoursInRange(resourceIds, dateRange.start, asOf);
    // a range that has not ended yet can still gain sessions, even if none is open right now
    const isProvisional = dateRange.end.getTime() >= now.getTime();

    const rows = resources.map((resource): ResourceHoursSummaryRowDto => ({
      resourceId: resource.id,
      resourceName: resource.name,
      metadata: resource.metadata,
      sessionCount: sessionsByResourceId.get(resource.id) ?? 0,
      ...(hoursByResourceId.get(resource.id) ?? NO_HOURS),
      isProvisional,
    }));
    return [rows, total] as const;
  }

  /**
   * Derives the hours with the same bounds per call as the operating durations report (100 resources, 31 days), so
   * memory stays bounded for long ranges. Durations clipped to disjoint windows add up to the clipped total.
   */
  private async sumHoursInRange(resourceIds: number[], start: Date, asOf: Date) {
    const hoursByResourceId = new Map<number, ResourceHours>();
    for (let offset = 0; offset < resourceIds.length; offset += MAX_RESOURCE_IDS_PER_REPORT) {
      const batch = resourceIds.slice(offset, offset + MAX_RESOURCE_IDS_PER_REPORT);
      const firstActivity = await this.firstActivityInRange(batch, start, asOf);
      for (
        let windowStart = firstActivity.getTime();
        windowStart < asOf.getTime();
        windowStart += MAX_REPORT_DURATION_MS
      ) {
        const windowEnd = new Date(Math.min(windowStart + MAX_REPORT_DURATION_MS, asOf.getTime()));
        // isProvisional is decided for the whole range by the caller
        const summaries = await this.operatingAttributionService.getForResources(
          batch,
          new Date(windowStart),
          windowEnd,
          false,
        );
        summaries.forEach((summary, resourceId) =>
          hoursByResourceId.set(resourceId, addHours(hoursByResourceId.get(resourceId) ?? NO_HOURS, summary)),
        );
      }
    }
    return hoursByResourceId;
  }

  /** Where the batch's first session or interval overlapping the range starts: the windows before it are empty. */
  private async firstActivityInRange(resourceIds: number[], start: Date, asOf: Date): Promise<Date> {
    const first = await this.reader.findFirstActivityStart(resourceIds, start, asOf);
    const firstStarts = first ? [first.getTime()] : [];
    return new Date(Math.max(start.getTime(), Math.min(asOf.getTime(), ...firstStarts)));
  }
}

function addHours(hours: ResourceHours, summary: ResourceOperatingAttributionSummary): ResourceHours {
  const add = (total: number | null, value: number | null) => (value === null ? null : (total ?? 0) + value);
  return {
    personDurationMs: hours.personDurationMs + summary.personDurationMs,
    sessionDurationMs: hours.sessionDurationMs + summary.sessionDurationMs,
    operatingDataAvailable: summary.operatingDataAvailable,
    operatingDurationMs: add(hours.operatingDurationMs, summary.operatingDurationMs),
    unattributedOperatingDurationMs: add(
      hours.unattributedOperatingDurationMs,
      summary.unattributedOperatingDurationMs,
    ),
  };
}
