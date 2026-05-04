// Unit tests for CronTimer wrapper recording duration, status, and last-run timestamps
// FEATURE: Metrics — cron job timing instrumentation
import { Registry } from 'prom-client';
import { createCronMetrics } from '../definitions/cron.metrics';
import { MetricsToggleService } from '../settings/metrics-toggle.service';
import { CronTimer } from './cron.helper';

describe('CronTimer.time', () => {
  function setup(enabled = true) {
    const registry = new Registry();
    const metrics = createCronMetrics(registry);
    const toggle = { isEnabledCached: jest.fn().mockReturnValue(enabled) } as unknown as MetricsToggleService;
    const timer = new CronTimer(metrics, toggle);
    return { registry, metrics, timer, toggle };
  }

  it('records success run with counter, duration, and last-success timestamp', async () => {
    const { registry, timer } = setup();

    await timer.time('session_cleanup', async () => 'ok');

    const text = await registry.metrics();
    expect(text).toContain('attraccess_cron_job_runs_total{job_name="session_cleanup",status="success"} 1');
    expect(text).toContain('attraccess_cron_job_duration_seconds_count{job_name="session_cleanup"} 1');
    expect(text).toMatch(/attraccess_cron_job_last_success_timestamp_seconds\{job_name="session_cleanup"\} \d/);
    expect(text).toMatch(/attraccess_cron_job_last_run_timestamp_seconds\{job_name="session_cleanup"\} \d/);
  });

  it('records failure status, rethrows error, and does not set last-success timestamp', async () => {
    const { registry, timer } = setup();

    await expect(
      timer.time('session_cleanup', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const text = await registry.metrics();
    expect(text).toContain('attraccess_cron_job_runs_total{job_name="session_cleanup",status="failure"} 1');
    expect(text).toContain('attraccess_cron_job_duration_seconds_count{job_name="session_cleanup"} 1');
    expect(text).not.toMatch(/attraccess_cron_job_last_success_timestamp_seconds\{job_name="session_cleanup"\} \d/);
  });

  it('always sets last-run timestamp when entering, even when fn throws', async () => {
    const { registry, timer } = setup();
    const beforeUnix = Date.now() / 1000 - 1;

    await expect(
      timer.time('maintenance_evaluator', async () => {
        throw new Error('x');
      }),
    ).rejects.toThrow('x');

    const text = await registry.metrics();
    const match = text.match(/attraccess_cron_job_last_run_timestamp_seconds\{job_name="maintenance_evaluator"\} (\d+(?:\.\d+)?)/);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(beforeUnix);
  });

  it('skips recording but still runs payload when toggle disabled', async () => {
    const { registry, timer } = setup(false);
    let called = false;

    const result = await timer.time('sumup_poll', async () => {
      called = true;
      return 42;
    });

    expect(called).toBe(true);
    expect(result).toBe(42);
    const text = await registry.metrics();
    expect(text).not.toContain('attraccess_cron_job_runs_total{');
    expect(text).not.toContain('attraccess_cron_job_duration_seconds_count{');
  });

  it('reads toggle synchronously via isEnabledCached', async () => {
    const { timer, toggle } = setup();

    await timer.time('flow_minute_tick', async () => undefined);

    expect(toggle.isEnabledCached).toHaveBeenCalledWith('cron');
    expect(toggle.isEnabledCached).toHaveBeenCalledTimes(1);
  });
});
