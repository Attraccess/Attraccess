import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { BruteForceProtectionService, RateLimitScope } from './brute-force.service';
import { AuthAuditLogger, AuthAuditOutcome, AuthAuditType } from './auth-audit.logger';
import { AccountLockedException, TooManyAuthAttemptsException } from './exceptions';
import {
  AUTH_RATE_LIMIT_METADATA,
  AUTH_RATE_LIMIT_OPTIONS_METADATA,
  AuthRateLimitOptions,
} from './rate-limit.decorator';
import { resolveIp, setRetryAfter } from './login.rate-limit.guard';

@Injectable()
export class AuthRateLimitInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuthRateLimitInterceptor.name);

  constructor(
    private readonly bruteForce: BruteForceProtectionService,
    private readonly audit: AuthAuditLogger,
    private readonly reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const scope = this.reflector.get<RateLimitScope>(AUTH_RATE_LIMIT_METADATA, context.getHandler());
    if (!scope) {
      return next.handle();
    }
    const { clearFailuresOnSuccess = true } =
      this.reflector.get<AuthRateLimitOptions>(AUTH_RATE_LIMIT_OPTIONS_METADATA, context.getHandler()) ?? {};

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const ip = resolveIp(request);
    const auditType = scopeToAuditType(scope);
    const userId = extractUserIdFromRequest(request, scope);

    try {
      await this.bruteForce.assertIpAllowed(scope, ip);
    } catch (error) {
      setRetryAfter(response, error);
      this.audit.log({ type: auditType, outcome: 'rate_limited', ip, userId, reason: 'ip_throttled' });
      throw error;
    }

    return next.handle().pipe(
      tap({
        next: () => {
          if (clearFailuresOnSuccess) {
            this.bruteForce
              .recordSuccess(scope, ip, userId)
              .catch((err) => this.logger.error(`recordSuccess failed for scope=${scope}`, err as Error));
          }
          this.audit.log({ type: auditType, outcome: 'success', ip, userId });
        },
        error: (err: unknown) => {
          this.bruteForce
            .recordFailure(scope, ip, userId)
            .catch((recErr) => this.logger.error(`recordFailure failed for scope=${scope}`, recErr as Error));
          this.audit.log({
            type: auditType,
            outcome: classifyOutcome(err),
            ip,
            userId,
            reason: errorName(err),
          });
          setRetryAfter(response, err);
        },
      }),
    );
  }
}

function scopeToAuditType(scope: RateLimitScope): AuthAuditType {
  if (scope === 'login') return 'login';
  if (scope === 'register') return 'register';
  if (scope === 'password_reset_request') return 'password_reset_request';
  if (scope === 'password_reset_complete') return 'password_reset_complete';
  return 'delete_account_confirm';
}

function extractUserIdFromRequest(request: Request, scope: RateLimitScope): number | null {
  if (scope !== 'password_reset_complete') return null;
  const raw = (request.params as { userId?: string } | undefined)?.userId;
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function classifyOutcome(error: unknown): AuthAuditOutcome {
  if (error instanceof TooManyAuthAttemptsException) return 'rate_limited';
  if (error instanceof AccountLockedException) return 'account_locked';
  if (error instanceof UnauthorizedException) return 'invalid_credentials';
  if (error instanceof ForbiddenException) return 'invalid_token';
  return 'invalid_input';
}

function errorName(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error) {
    return String((error as { name: string }).name);
  }
  return 'Error';
}
