import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB_METRICS } from '../../definitions/tokens';
import { DbMetrics } from '../../definitions/db.metrics';
import { MetricsToggleService } from '../../settings/metrics-toggle.service';
import { MetricsQueryInstrumentation, QueryObservation } from '../../persistence/port';

@Injectable()
export class DbMetricsInstrumentation implements OnModuleInit {
  constructor(
    @Inject(DB_METRICS) private readonly metrics: DbMetrics,
    private readonly toggle: MetricsToggleService,
    private readonly instrumentation: MetricsQueryInstrumentation,
  ) {}

  onModuleInit(): void {
    this.install();
  }

  install(): void {
    this.instrumentation.install({
      enabled: () => this.toggle.isEnabledCached('db'),
      record: (observation) => this.record(observation),
    });
  }

  private record(observation: QueryObservation): void {
    const labels = { entity: observation.entity, method: observation.method };
    this.metrics.queryDuration.observe(labels, observation.seconds);
    if (observation.errorType !== undefined) {
      this.metrics.queryErrorsTotal.inc({ ...labels, error_type: observation.errorType });
    } else if (observation.seconds > this.toggle.getSlowQueryThresholdSecondsCached()) {
      this.metrics.slowQueriesTotal.inc(labels);
    }
  }
}
