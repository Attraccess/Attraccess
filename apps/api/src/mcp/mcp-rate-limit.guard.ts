import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { FixedWindowCounterStore, WindowCounterEntry } from '../common/rate-limiting/fixed-window-counter';
import { resolveIp } from '../users-and-auth/rate-limiting/login.rate-limit.guard';

export type McpRateLimitName = 'mcp' | 'authorize' | 'token' | 'register' | 'consent';

const LIMITS: Record<McpRateLimitName, { limit: number; windowMs: number }> = {
  // Tool calls also pass the REST limits of the endpoint they execute; this only bounds the transport itself.
  mcp: { limit: 600, windowMs: 60_000 },
  authorize: { limit: 60, windowMs: 60_000 },
  token: { limit: 60, windowMs: 60_000 },
  // Registration is open to anyone and creates database rows.
  register: { limit: 20, windowMs: 60 * 60_000 },
  consent: { limit: 60, windowMs: 60_000 },
};

const MCP_RATE_LIMIT = 'mcp_rate_limit';
export const McpRateLimit = (name: McpRateLimitName) => SetMetadata(MCP_RATE_LIMIT, name);

/** Per-client-IP fixed window for the MCP and OAuth endpoints. State is per process, like the other in-memory limiters. */
@Injectable()
export class McpRateLimitGuard implements CanActivate {
  private readonly counters = new FixedWindowCounterStore<string, WindowCounterEntry>(10_000);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const name = this.reflector.getAllAndOverride<McpRateLimitName>(MCP_RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!name) return true;
    const { limit, windowMs } = LIMITS[name];
    const request = context.switchToHttp().getRequest<Request>();
    const key = `${name}:${resolveIp(request)}`;
    const now = Date.now();
    let entry = this.counters.get(key);
    if (!entry || now - entry.firstAt >= windowMs) {
      this.counters.evict((candidate) => now - candidate.firstAt >= windowMs);
      entry = { count: 0, firstAt: now };
      this.counters.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((entry.firstAt + windowMs - now) / 1000));
      context.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(retryAfter));
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
