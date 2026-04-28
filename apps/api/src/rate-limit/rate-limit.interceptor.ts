// NestJS interceptor that enforces per-IP rate limits annotated with @RateLimit
// FEATURE: Rate limiting subsystem for unauthenticated API endpoints

import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import {
  RATE_LIMIT_METADATA_KEY,
  RATE_LIMIT_SILENT_OK_BODY,
} from './rate-limit.constants';
import { RateLimitService } from './rate-limit.service';
import type { RateLimitMetadata } from './rate-limit.types';

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimit: RateLimitService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const metadata = this.reflector.get<RateLimitMetadata | null>(
      RATE_LIMIT_METADATA_KEY,
      context.getHandler(),
    );
    if (!metadata) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<{ ip?: string; ips?: string[]; headers?: Record<string, string | string[] | undefined> }>();
    const ip = this.resolveIp(request);
    const decision = await this.rateLimit.checkIp(metadata.scope, ip);
    if (decision.allowed) {
      return next.handle();
    }

    if (metadata.mode === 'silentOk') {
      return of(RATE_LIMIT_SILENT_OK_BODY);
    }

    const response = http.getResponse<{ setHeader: (name: string, value: number | string) => void }>();
    response.setHeader('Retry-After', decision.retryAfterSeconds);
    throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
  }

  private resolveIp(request: {
    ip?: string;
    ips?: string[];
    headers?: Record<string, string | string[] | undefined>;
  }): string {
    if (Array.isArray(request.ips) && request.ips.length > 0) {
      return request.ips[0];
    }
    if (request.ip) return request.ip;
    return 'unknown';
  }
}
