import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { KeyedFixedWindowLimiter } from '../../../common/rate-limiting/keyed-fixed-window-limiter';
import { addressBucket } from '../../../device-enrollment/client-address';
import { resolveIp } from '../../../users-and-auth/rate-limiting/login.rate-limit.guard';

/** `read`, `write`: the public phone endpoints, per client address. `upload`: signed-in uploads, per user. */
export type FormPhotoRateLimitName = 'read' | 'write' | 'upload';

const LIMITS: Record<FormPhotoRateLimitName, { limit: number; windowMs: number }> = {
  // Page loads and thumbnails of a phone that has the link open.
  read: { limit: 120, windowMs: 60_000 },
  // Uploads and deletions: a handful of photos, however the link is held.
  write: { limit: 30, windowMs: 10 * 60_000 },
  // A form takes at most ten photos per field; a member uploading more than this is not filling in a form.
  upload: { limit: 30, windowMs: 10 * 60_000 },
};

const FORM_PHOTO_RATE_LIMIT = 'form_photo_rate_limit';
export const FormPhotoRateLimit = (name: FormPhotoRateLimitName) => SetMetadata(FORM_PHOTO_RATE_LIMIT, name);

/**
 * Fixed windows for the form image endpoints: the public reader handoff endpoints per client address (IPv6 bucketed by
 * /64), like the MCP and OAuth limits, and signed-in uploads per user, so one member cannot fill the disk. State is per
 * process; the handoff token itself carries a hard cap on uploads in the database. For `upload` the guard must run
 * after the sign-in guard: a request without a user is not counted.
 */
@Injectable()
export class FormPhotoRateLimitGuard implements CanActivate {
  private readonly limiter = new KeyedFixedWindowLimiter(LIMITS);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const name = this.reflector.getAllAndOverride<FormPhotoRateLimitName>(FORM_PHOTO_RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!name) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const key = name === 'upload' ? userKey(request) : addressBucket(resolveIp(request));
    if (key !== null) this.limiter.hit(context, name, key);
    return true;
  }
}

function userKey(request: Request): string | null {
  const userId = (request.user as { id?: number } | undefined)?.id;
  return userId == null ? null : `user:${userId}`;
}
