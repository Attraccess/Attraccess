// NestJS guard variant of RateLimitInterceptor for routes with upstream guards
// FEATURE: Rate limiting subsystem for unauthenticated API endpoints

import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMIT_METADATA_KEY } from './rate-limit.constants';
import { RateLimitService } from './rate-limit.service';
import type { RateLimitMetadata } from './rate-limit.types';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimit: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.get<RateLimitMetadata | null>(
      RATE_LIMIT_METADATA_KEY,
      context.getHandler(),
    );
    if (!metadata || metadata.mode !== '429') {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<{ ip?: string; ips?: string[] }>();
    const ip = this.resolveIp(request);
    const decision = await this.rateLimit.checkIp(metadata.scope, ip);
    if (decision.allowed) {
      return true;
    }

    const response = http.getResponse<{
      setHeader: (name: string, value: number | string) => void;
    }>();
    response.setHeader('Retry-After', decision.retryAfterSeconds);
    throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
  }

  private resolveIp(request: { ip?: string; ips?: string[] }): string {
    if (Array.isArray(request.ips) && request.ips.length > 0) {
      return request.ips[0];
    }
    if (request.ip) return request.ip;
    return 'unknown';
  }
}
