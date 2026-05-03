// Global Nest interceptor recording WS message duration + count via Prometheus
// FEATURE: Metrics — WebSocket message timing instrumentation
import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { WS_METRICS } from '../definitions/tokens';
import { ATTRACTAP_GATEWAY_LABEL, WsMetrics } from '../definitions/ws.metrics';
import { MetricsToggleService } from '../settings/metrics-toggle.service';

@Injectable()
export class WsMetricsInterceptor implements NestInterceptor {
  constructor(
    @Inject(WS_METRICS) private readonly metrics: WsMetrics,
    private readonly toggle: MetricsToggleService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'ws') {
      return next.handle();
    }
    if (!this.toggle.isEnabledCached('ws')) {
      return next.handle();
    }
    const event = String(context.switchToWs().getPattern() ?? 'unknown');
    const startTime = process.hrtime.bigint();
    return next.handle().pipe(
      tap({
        next: () => {
          this.record(event, 'success', startTime);
        },
        error: () => {
          this.record(event, 'error', startTime);
        },
      }),
    );
  }

  private record(event: string, status: 'success' | 'error', startTime: bigint): void {
    const seconds = Number(process.hrtime.bigint() - startTime) / 1e9;
    const labels = { gateway: ATTRACTAP_GATEWAY_LABEL, event, status };
    this.metrics.messageDuration.observe(labels, seconds);
    this.metrics.messagesTotal.inc(labels);
  }
}
