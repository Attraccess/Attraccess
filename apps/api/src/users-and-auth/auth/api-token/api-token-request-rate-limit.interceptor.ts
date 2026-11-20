import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { AuthAuditLogger } from '../../rate-limiting/auth-audit.logger';
import { ApiTokenRequestRateLimitService } from './api-token-request-rate-limit.service';

const SKIP_API_TOKEN_REQUEST_LIMIT = 'skip_api_token_request_limit';

type SkipWhen = (request: AuthenticatedRequest) => boolean;

/**
 * For a route that forwards its work to other REST routes with the same token (the MCP transport): when `when` says
 * the request will be forwarded, the forwarded requests are charged, and charging the outer one too would halve the
 * token's budget. Any other request on the route is charged as usual.
 */
export const SkipApiTokenRequestLimit = (when: SkipWhen) => SetMetadata(SKIP_API_TOKEN_REQUEST_LIMIT, when);

@Injectable()
export class ApiTokenRequestRateLimitInterceptor implements NestInterceptor {
  constructor(
    private readonly rateLimitService: ApiTokenRequestRateLimitService,
    private readonly authAuditLogger: AuthAuditLogger,
    private readonly reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { user } = request;
    if (user?.authenticationMethod !== 'api-token' || user.apiTokenId === undefined) return next.handle();
    const skipWhen = this.reflector.getAllAndOverride<SkipWhen | undefined>(SKIP_API_TOKEN_REQUEST_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipWhen?.(request)) return next.handle();

    try {
      await this.rateLimitService.assertWithinLimit(user.apiTokenId);
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
