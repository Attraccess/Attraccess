import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { UsersService } from '../users/users.service';
import { AuthAuditLogger, AuthAuditOutcome } from './auth-audit.logger';
import { BruteForceProtectionService } from './brute-force.service';
import { AccountLockedException, TooManyAuthAttemptsException } from './exceptions';

@Injectable()
export class LoginRateLimitGuard extends AuthGuard(['local']) {
  constructor(
    private readonly bruteForce: BruteForceProtectionService,
    private readonly usersService: UsersService,
    private readonly audit: AuthAuditLogger,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const ip = resolveIp(request);
    const username = sanitizeUsername(request.body?.username);

    try {
      await this.bruteForce.assertIpAllowed('login', ip);
    } catch (error) {
      setRetryAfter(response, error);
      this.audit.log({ type: 'login', outcome: 'rate_limited', ip, username, reason: 'ip_throttled' });
      throw error;
    }

    let preCheckedUserId: number | null = null;
    if (username) {
      const user = await this.usersService.findOne({ username }).catch(() => null);
      if (user) {
        preCheckedUserId = user.id;
        try {
          await this.bruteForce.assertAccountAllowed(user);
        } catch (error) {
          setRetryAfter(response, error);
          this.audit.log({
            type: 'login',
            outcome: 'account_locked',
            ip,
            userId: user.id,
            username,
            reason: 'account_locked',
          });
          throw error;
        }
      }
    }

    let activated: boolean;
    try {
      const result = await super.canActivate(context);
      activated = result instanceof Observable ? await observableToPromise(result) : Boolean(result);
    } catch (error) {
      const outcome = classifyLoginFailure(error);
      await this.bruteForce.recordFailure('login', ip, preCheckedUserId);
      this.audit.log({
        type: 'login',
        outcome,
        ip,
        userId: preCheckedUserId,
        username,
        reason: errorName(error),
      });
      throw error;
    }

    const user = (request as Request & { user?: { id: number; username?: string } }).user;
    await this.bruteForce.recordSuccess('login', ip, user?.id ?? preCheckedUserId);
    this.audit.log({
      type: 'login',
      outcome: 'success',
      ip,
      userId: user?.id ?? null,
      username: user?.username ?? username,
    });
    return activated;
  }
}

function classifyLoginFailure(error: unknown): AuthAuditOutcome {
  const name = errorName(error);
  if (name === 'AccountLockedException' || error instanceof AccountLockedException) {
    return 'account_locked';
  }
  if (name === 'TooManyAuthAttemptsException' || error instanceof TooManyAuthAttemptsException) {
    return 'rate_limited';
  }
  const message = errorMessage(error);
  if (message === 'TwoFactorRequired') return 'two_factor_required';
  if (message === 'TwoFactorInvalidCode') return 'two_factor_invalid';
  if (message === 'UserEmailNotVerifiedException') return 'email_not_verified';
  if (error instanceof UnauthorizedException) return 'invalid_credentials';
  return 'invalid_credentials';
}

function errorName(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error) {
    return String((error as { name: string }).name);
  }
  return 'Error';
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: string }).message);
  }
  return '';
}

async function observableToPromise(observable: Observable<boolean>): Promise<boolean> {
  return new Promise((resolve, reject) => {
    observable.subscribe({ next: resolve, error: reject });
  });
}

export function resolveIp(request: Request): string {
  return (
    request.ip ||
    (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    request.socket?.remoteAddress ||
    'unknown'
  );
}

export function sanitizeUsername(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function setRetryAfter(response: Response, error: unknown): void {
  if (!response?.setHeader) return;
  if (error instanceof TooManyAuthAttemptsException || error instanceof AccountLockedException) {
    response.setHeader('Retry-After', String(error.retryAfterSeconds));
  }
}
