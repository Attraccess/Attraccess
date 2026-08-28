// Global Nest interceptor recording HTTP request duration + count via Prometheus
// FEATURE: Metrics — HTTP timing instrumentation
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Inject } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { HTTP_METRICS } from '../../definitions/tokens';
import { HttpMetrics } from '../../definitions/http.metrics';
import { MetricsToggleService } from '../../settings/metrics-toggle.service';

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
    if (!this.toggle.isEnabledCached('http')) {
      return next.handle();
    }
    const httpCtx = context.switchToHttp();
    const request = httpCtx.getRequest<Request>();
    // SSE connections are long-lived; recording their duration as HTTP latency is misleading.
    if ((request.headers?.['accept'] ?? '').includes('text/event-stream')) {
      return next.handle();
    }
    const startTime = process.hrtime.bigint();
    const route = request.route?.path || 'unmatched';
    const method = request.method;
    return next.handle().pipe(
      tap({
        next: () => {
          const response = httpCtx.getResponse<Response>();
          this.record(method, route, response.statusCode, startTime, authenticationMethod(request));
        },
        error: (error) => {
          const statusCode = error?.status || error?.statusCode || 500;
          this.record(method, route, statusCode, startTime, authenticationMethod(request));
        },
      }),
    );
  }

  private record(method: string, route: string, statusCode: number, startTime: bigint, authMethod: string): void {
    const seconds = Number(process.hrtime.bigint() - startTime) / 1e9;
    const labels = { method, route, status_code: String(statusCode), auth_method: authMethod };
    this.metrics.duration.observe(labels, seconds);
    this.metrics.total.inc(labels);
  }
}

function authenticationMethod(request: Request): 'api-token' | 'session' | 'anonymous' {
  const method = (request.user as { authenticationMethod?: string } | undefined)?.authenticationMethod;
  return method === 'api-token' || method === 'session' ? method : 'anonymous';
}
