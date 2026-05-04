// External call timing wrapper recording duration histogram and error counters
// FEATURE: Metrics — external call timing instrumentation (SumUp, SMTP, MQTT)
import { Inject, Injectable } from '@nestjs/common';
import { EXTERNAL_METRICS } from '../../definitions/tokens';
import { ExternalMetrics } from '../../definitions/external.metrics';
import { MetricsToggleService } from '../../settings/metrics-toggle.service';

export type ExternalTarget = 'sumup' | 'smtp' | 'mqtt' | 'github';

type ErrorType = 'timeout' | 'network' | 'auth' | 'unknown';

@Injectable()
export class ExternalCallTimer {
  constructor(
    @Inject(EXTERNAL_METRICS) private readonly metrics: ExternalMetrics,
    private readonly toggle: MetricsToggleService,
  ) {}

  async time<T>(target: ExternalTarget, operation: string, fn: () => Promise<T>): Promise<T> {
    if (!this.toggle.isEnabledCached('external')) {
      return fn();
    }
    const start = process.hrtime.bigint();
    try {
      const result = await fn();
      this.observe(target, operation, 'success', start);
      return result;
    } catch (err) {
      this.observe(target, operation, 'error', start);
      this.metrics.callErrorsTotal.inc({ target, operation, error_type: classifyError(err) });
      throw err;
    }
  }

  private observe(target: ExternalTarget, operation: string, status: 'success' | 'error', start: bigint): void {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    this.metrics.callDuration.observe({ target, operation, status }, seconds);
  }
}

function classifyError(err: unknown): ErrorType {
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  if (msg.includes('timeout') || msg.includes('etimedout')) return 'timeout';
  if (msg.includes('econnrefused') || msg.includes('enotfound')) return 'network';
  if (msg.includes('401') || msg.includes('403')) return 'auth';
  return 'unknown';
}
