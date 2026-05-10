// Prometheus metric definitions for the cron subsystem
// FEATURE: Metrics — cron job duration, run counter, and last-run/last-success gauges
import { Counter, Gauge, Histogram, Registry } from 'prom-client';

export interface CronMetrics {
  duration: Histogram<'job_name'>;
  runsTotal: Counter<'job_name' | 'status'>;
  lastRunTimestamp: Gauge<'job_name'>;
  lastSuccessTimestamp: Gauge<'job_name'>;
}

export function createCronMetrics(registry: Registry): CronMetrics {
  return {
    duration: new Histogram({
      name: 'attraccess_cron_job_duration_seconds',
      help: 'Duration of cron job runs in seconds',
      labelNames: ['job_name'],
      buckets: [0.1, 0.5, 1, 5, 15, 30, 60, 300, 900, 1800],
      registers: [registry],
    }),
    runsTotal: new Counter({
      name: 'attraccess_cron_job_runs_total',
      help: 'Total number of cron job runs by status',
      labelNames: ['job_name', 'status'],
      registers: [registry],
    }),
    lastRunTimestamp: new Gauge({
      name: 'attraccess_cron_job_last_run_timestamp_seconds',
      help: 'Unix timestamp (seconds) of the last cron job run start',
      labelNames: ['job_name'],
      registers: [registry],
    }),
    lastSuccessTimestamp: new Gauge({
      name: 'attraccess_cron_job_last_success_timestamp_seconds',
      help: 'Unix timestamp (seconds) of the last successful cron job run',
      labelNames: ['job_name'],
      registers: [registry],
    }),
  };
}
