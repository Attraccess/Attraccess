// Cron job timing wrapper recording duration histogram, run counter, and last-run gauges
// FEATURE: Metrics — cron job timing instrumentation
import { Inject, Injectable } from '@nestjs/common';
import { CRON_METRICS } from '../../definitions/tokens';
import { CronMetrics } from '../../definitions/cron.metrics';
import { MetricsToggleService } from '../../settings/metrics-toggle.service';

export type CronJobName =
  | 'sumup_poll'
  | 'session_cleanup'
  | 'maintenance_evaluator'
  | 'flow_daily_cleanup'
  | 'flow_minute_tick';

@Injectable()
export class CronTimer {
  constructor(
    @Inject(CRON_METRICS) private readonly metrics: CronMetrics,
    private readonly toggle: MetricsToggleService,
  ) {}

  async time<T>(jobName: CronJobName, fn: () => Promise<T>): Promise<T> {
    if (!this.toggle.isEnabledCached('cron')) {
      return fn();
    }
    const start = process.hrtime.bigint();
    this.metrics.lastRunTimestamp.set({ job_name: jobName }, Date.now() / 1000);
    try {
      const result = await fn();
      this.observe(jobName, 'success', start);
      this.metrics.lastSuccessTimestamp.set({ job_name: jobName }, Date.now() / 1000);
      return result;
    } catch (err) {
      this.observe(jobName, 'failure', start);
      throw err;
    }
  }

  private observe(jobName: CronJobName, status: 'success' | 'failure', start: bigint): void {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    this.metrics.duration.observe({ job_name: jobName }, seconds);
    this.metrics.runsTotal.inc({ job_name: jobName, status });
  }
}
