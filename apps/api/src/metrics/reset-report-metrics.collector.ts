import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttractapCrashReport } from '@attraccess/database-entities';
import { MetricsService } from './metrics.service';
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

export const COUNT_SQL = `SELECT r."attractapId" AS attractapId, a."name" AS readerName, r."resetReason" AS resetReason, COUNT(*) AS count
  FROM "attractap_crash_report" r
  LEFT JOIN "attractap" a ON a."id" = r."attractapId"
  WHERE r."createdAt" > ? AND r."createdAt" <= ? AND r."resetReason" IN (${[...CRASH_WATCHDOG_REASONS, ...POWER_ON_REASONS]
    .map(() => '?')
    .join(', ')})
  GROUP BY r."attractapId", a."name", r."resetReason"`;

/** Counts stored reset reports of the last hour from the database at every metrics collection. */
@Injectable()
export class ResetReportMetricsCollector implements OnModuleInit {
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly metrics: MetricsService,
    @InjectRepository(AttractapCrashReport)
    private readonly reports: Repository<AttractapCrashReport>,
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
    const { from, to } = hourWindow(Date.now());
    const rows = (await this.reports.query(COUNT_SQL, [
      from,
      to,
      ...CRASH_WATCHDOG_REASONS,
      ...POWER_ON_REASONS,
    ])) as ResetReportRow[];
    this.publish(rows.map((row) => ({ ...row, count: Number(row.count) })));
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
