// SSE stream instrumentation tracking active connections, lifetime, and message count
// FEATURE: Metrics — Server-Sent Events instrumentation
import { Inject, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { SSE_METRICS } from '../../definitions/tokens';
import { SseMetrics } from '../../definitions/sse.metrics';
import { MetricsToggleService } from '../../settings/metrics-toggle.service';

export type SseStream = 'resource_usage' | 'billing' | 'resource_flows';

@Injectable()
export class SseInstrumentation {
  constructor(
    @Inject(SSE_METRICS) private readonly metrics: SseMetrics,
    private readonly toggle: MetricsToggleService,
  ) {}

  wrap<T>(stream: SseStream, source: Observable<T>): Observable<T> {
    if (!this.toggle.isEnabledCached('sse')) return source;
    return new Observable<T>((subscriber) => {
      const start = process.hrtime.bigint();
      this.metrics.activeConnections.inc({ stream });

      const sub = source.subscribe({
        next: (value) => {
          subscriber.next(value);
          this.metrics.messagesSentTotal.inc({ stream });
        },
        error: (err) => subscriber.error(err),
        complete: () => subscriber.complete(),
      });

      return () => {
        sub.unsubscribe();
        this.metrics.activeConnections.dec({ stream });
        this.metrics.connectionDuration.observe(
          { stream },
          Number(process.hrtime.bigint() - start) / 1e9,
        );
      };
    });
  }
}
