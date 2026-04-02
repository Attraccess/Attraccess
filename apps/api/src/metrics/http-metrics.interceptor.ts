import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';
import { Request, Response } from 'express';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const httpCtx = context.switchToHttp();
    const request = httpCtx.getRequest<Request>();
    const startTime = process.hrtime.bigint();

    const route = request.route?.path || request.path || 'unknown';
    const method = request.method;

    return next.handle().pipe(
      tap({
        next: () => {
          const response = httpCtx.getResponse<Response>();
          this.recordMetrics(method, route, response.statusCode, startTime);
        },
        error: (error) => {
          const statusCode = error?.status || error?.statusCode || 500;
          this.recordMetrics(method, route, statusCode, startTime);
        },
      }),
    );
  }

  private recordMetrics(method: string, route: string, statusCode: number, startTime: bigint): void {
    const durationSeconds = Number(process.hrtime.bigint() - startTime) / 1e9;
    const labels = { method, route, status_code: String(statusCode) };
    this.metricsService.httpRequestDuration.observe(labels, durationSeconds);
    this.metricsService.httpRequestsTotal.inc(labels);
  }
}
