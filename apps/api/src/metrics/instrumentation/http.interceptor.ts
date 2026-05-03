// Global Nest interceptor recording HTTP request duration + count via Prometheus
// FEATURE: Metrics — HTTP timing instrumentation
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Inject } from '@nestjs/common';
import { Observable, tap, from, switchMap } from 'rxjs';
import { Request, Response } from 'express';
import { HTTP_METRICS } from '../definitions/tokens';
import { HttpMetrics } from '../definitions/http.metrics';
import { MetricsToggleService } from '../settings/metrics-toggle.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(
    @Inject(HTTP_METRICS) private readonly metrics: HttpMetrics,
    private readonly toggle: MetricsToggleService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const httpCtx = context.switchToHttp();
    const request = httpCtx.getRequest<Request>();
    const startTime = process.hrtime.bigint();
    const route = request.route?.path || 'unmatched';
    const method = request.method;

    return from(this.toggle.isEnabled('http')).pipe(
      switchMap((enabled) =>
        next.handle().pipe(
          tap({
            next: () => {
              if (enabled) {
                const response = httpCtx.getResponse<Response>();
                this.record(method, route, response.statusCode, startTime);
              }
            },
            error: (error) => {
              if (enabled) {
                const statusCode = error?.status || error?.statusCode || 500;
                this.record(method, route, statusCode, startTime);
              }
            },
          }),
        ),
      ),
    );
  }

  private record(method: string, route: string, statusCode: number, startTime: bigint): void {
    const seconds = Number(process.hrtime.bigint() - startTime) / 1e9;
    const labels = { method, route, status_code: String(statusCode) };
    this.metrics.duration.observe(labels, seconds);
    this.metrics.total.inc(labels);
  }
}
