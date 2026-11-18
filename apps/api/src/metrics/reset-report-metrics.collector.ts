import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { RESET_REPORT_COUNT_READER, ResetReportCountReader } from './metrics-readers.port';
import {
  CRASH_WATCHDOG_REASONS,
  POWER_ON_REASONS,
  RESET_REPORT_CATEGORIES,
  ResetReportRow,
  categoryOf,
  describeReaders,
  hourWindow,
} from './reset-report-metrics';

export const RESET_REPORT_COUNT_DEADLINE_MS = 5000;

/** Counts stored reset reports of the last hour from the database at every metrics collection. */
@Injectable()
export class ResetReportMetricsCollector implements OnModuleInit {
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly metrics: MetricsService,
    @Inject(RESET_REPORT_COUNT_READER)
    private readonly reports: ResetReportCountReader,
  ) {}

  onModuleInit(): void {
    this.metrics.registerRefresher(() => this.refresh());
  }

  /**
   * Runs at most one count at a time; concurrent scrapes share it. Each caller fails after the deadline, but a
   * count that is still running is joined rather than restarted, so a slow database never piles up queries.
   */
  refresh(): Promise<void> {
    if (!this.inFlight) {
      this.inFlight = this.collect().finally(() => {
        this.inFlight = null;
      });
    }
    return this.withDeadline(this.inFlight);
  }

  private withDeadline(work: Promise<void>): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Counting reset reports exceeded ${RESET_REPORT_COUNT_DEADLINE_MS}ms`)),
        RESET_REPORT_COUNT_DEADLINE_MS,
      );
    });
    return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
  }

  private async collect(): Promise<void> {
    const rows = await this.reports.countByReaderAndReason(hourWindow(Date.now()), [
      ...CRASH_WATCHDOG_REASONS,
      ...POWER_ON_REASONS,
    ]);
    this.publish(rows);
  }

  private publish(rows: ResetReportRow[]): void {
    this.metrics.attractapResetReportsLastHour.reset();
    this.metrics.attractapResetReportReadersLastHour.reset();
    for (const category of RESET_REPORT_CATEGORIES) {
      const inCategory = rows.filter((row) => categoryOf(row.resetReason) === category);
      const total = inCategory.reduce((sum, row) => sum + row.count, 0);
      this.metrics.attractapResetReportsLastHour.set({ category }, total);
      if (total > 0) {
        this.metrics.attractapResetReportReadersLastHour.set({ category, readers: describeReaders(inCategory) }, total);
      }
    }
  }
}
