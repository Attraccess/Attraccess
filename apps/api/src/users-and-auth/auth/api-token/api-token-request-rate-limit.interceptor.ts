import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { AuthAuditLogger } from '../../rate-limiting/auth-audit.logger';
import { ApiTokenRequestRateLimitService } from './api-token-request-rate-limit.service';

@Injectable()
export class ApiTokenRequestRateLimitInterceptor implements NestInterceptor {
  constructor(
    private readonly rateLimitService: ApiTokenRequestRateLimitService,
    private readonly authAuditLogger: AuthAuditLogger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { user } = request;
    if (user?.authenticationMethod !== 'api-token' || user.apiTokenId === undefined) return next.handle();

    try {
      this.rateLimitService.assertWithinLimit(user.apiTokenId);
    } catch (error) {
      this.authAuditLogger.log({
        type: 'api_token',
        outcome: 'rate_limited',
        ip: resolveIp(request),
        userId: user.id,
        username: user.username,
        authenticationMethod: 'api-token',
        apiTokenId: user.apiTokenId,
        reason: 'api_token_request_limit',
      });
      throw error;
    }

    return next.handle();
  }
}

function resolveIp(request: AuthenticatedRequest): string {
  const raw = request.ip || request.socket?.remoteAddress || 'unknown';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}
