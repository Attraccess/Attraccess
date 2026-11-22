import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { FixedWindowCounterStore, WindowCounterEntry } from '../../../common/rate-limiting/fixed-window-counter';
import { addressBucket } from '../../../device-enrollment/client-address';
import { resolveIp } from '../../../users-and-auth/rate-limiting/login.rate-limit.guard';

export type FormPhotoRateLimitName = 'read' | 'write';

const LIMITS: Record<FormPhotoRateLimitName, { limit: number; windowMs: number }> = {
  // Page loads and thumbnails of a phone that has the link open.
  read: { limit: 120, windowMs: 60_000 },
  // Uploads and deletions: a handful of photos, however the link is held.
  write: { limit: 30, windowMs: 10 * 60_000 },
};

const FORM_PHOTO_RATE_LIMIT = 'form_photo_rate_limit';
export const FormPhotoRateLimit = (name: FormPhotoRateLimitName) => SetMetadata(FORM_PHOTO_RATE_LIMIT, name);

/**
 * Per-client-address fixed window for the public reader handoff endpoints (IPv6 bucketed by /64), like the MCP and
 * OAuth limits. State is per process; the token itself carries a hard cap on uploads in the database.
 */
@Injectable()
export class FormPhotoRateLimitGuard implements CanActivate {
  private readonly counters = new Map<FormPhotoRateLimitName, FixedWindowCounterStore<string, WindowCounterEntry>>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const name = this.reflector.getAllAndOverride<FormPhotoRateLimitName>(FORM_PHOTO_RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!name) return true;
    const { limit, windowMs } = LIMITS[name];
    const request = context.switchToHttp().getRequest<Request>();
    const key = addressBucket(resolveIp(request));
    const store = this.store(name);
    const now = Date.now();
    let entry = store.get(key);
    if (!entry || now - entry.firstAt >= windowMs) {
      store.evict((candidate) => now - candidate.firstAt >= windowMs);
      entry = { count: 0, firstAt: now };
      store.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((entry.firstAt + windowMs - now) / 1000));
      context.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(retryAfter));
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  private store(name: FormPhotoRateLimitName): FixedWindowCounterStore<string, WindowCounterEntry> {
    let store = this.counters.get(name);
    if (!store) {
      store = new FixedWindowCounterStore<string, WindowCounterEntry>(10_000);
      this.counters.set(name, store);
    }
    return store;
  }
}
