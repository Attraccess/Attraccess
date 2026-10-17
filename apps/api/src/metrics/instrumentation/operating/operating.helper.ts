// Recorder for operating-timeline metrics: signal transitions, current state, data-quality failures
// FEATURE: Metrics — machine operating timeline observability (ATT-1024)
import { Inject, Injectable } from '@nestjs/common';
import { OPERATING_METRICS } from '../../definitions/tokens';
import { OperatingMetricsDefinitions } from '../../definitions/operating.metrics';
import { MetricsToggleService } from '../../settings/metrics-toggle.service';

/** Mirrors ResourceOperatingState without importing the resources module (avoids a file cycle). */
export type OperatingStateLabel = 'operating' | 'idle';

export type OperatingDataQualityFailureKind =
  | 'stale-signal'
  | 'overlapping-intervals'
  | 'negative-duration'
  | 'multiple-open-intervals';

@Injectable()
export class OperatingMetricsRecorder {
  constructor(
    @Inject(OPERATING_METRICS) private readonly metrics: OperatingMetricsDefinitions,
    private readonly toggle: MetricsToggleService,
  ) {}

  recordTransition(state: OperatingStateLabel, applied: boolean): void {
    if (!this.toggle.isEnabledCached('flow')) {
      return;
    }
    this.metrics.transitionsTotal.inc({ state, result: applied ? 'applied' : 'noop' });
  }

  setResourceState(resourceId: number, state: OperatingStateLabel): void {
    if (!this.toggle.isEnabledCached('flow')) {
      return;
    }
    this.metrics.resourceState.set({ resource_id: String(resourceId) }, state === 'operating' ? 1 : 0);
  }

  recordDataQualityFailures(kind: OperatingDataQualityFailureKind, count: number): void {
    if (!this.toggle.isEnabledCached('flow') || count <= 0) {
      return;
    }
    this.metrics.dataQualityFailuresTotal.inc({ kind }, count);
  }
}
