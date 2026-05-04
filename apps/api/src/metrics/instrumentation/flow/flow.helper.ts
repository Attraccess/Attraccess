// Resource flow + node execution timing wrappers recording duration and execution counters
// FEATURE: Metrics — resource flow execution instrumentation
import { Inject, Injectable } from '@nestjs/common';
import { FLOW_METRICS } from '../../definitions/tokens';
import { FlowMetrics } from '../../definitions/flow.metrics';
import { MetricsToggleService } from '../../settings/metrics-toggle.service';

type Status = 'success' | 'failure';

@Injectable()
export class FlowTimer {
  constructor(
    @Inject(FLOW_METRICS) private readonly metrics: FlowMetrics,
    private readonly toggle: MetricsToggleService,
  ) {}

  async timeFlow<T>(triggerType: string, fn: () => Promise<T>): Promise<T> {
    if (!this.toggle.isEnabledCached('flow')) {
      return fn();
    }
    const start = process.hrtime.bigint();
    let status: Status = 'success';
    try {
      return await fn();
    } catch (err) {
      status = 'failure';
      throw err;
    } finally {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.executionDuration.observe({ trigger_type: triggerType, status }, seconds);
      this.metrics.executionsTotal.inc({ trigger_type: triggerType, status });
    }
  }

  async timeNode<T>(nodeType: string, fn: () => Promise<T>): Promise<T> {
    if (!this.toggle.isEnabledCached('flow')) {
      return fn();
    }
    const start = process.hrtime.bigint();
    let status: Status = 'success';
    try {
      return await fn();
    } catch (err) {
      status = 'failure';
      throw err;
    } finally {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.nodeDuration.observe({ node_type: nodeType, status }, seconds);
    }
  }
}
