import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { FixedWindowCounterStore, WindowCounterEntry } from '../common/rate-limiting/fixed-window-counter';
import { addressBucket } from '../device-enrollment/client-address';
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

/** JSON-RPC batch: every message counts, so one POST cannot carry a hundred tool calls for the price of one. */
function requestCost(request: Request): number {
  return Array.isArray(request.body) ? Math.max(1, request.body.length) : 1;
}

/**
 * Per-client-address fixed window for the MCP and OAuth endpoints (IPv6 bucketed by /64). State is per process, like
 * the other in-memory limiters. Each limit has its own store, so evicting one limit's stale windows never resets
 * another limit with a longer window.
 */
@Injectable()
export class McpRateLimitGuard implements CanActivate {
  private readonly counters = new Map<McpRateLimitName, FixedWindowCounterStore<string, WindowCounterEntry>>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const name = this.reflector.getAllAndOverride<McpRateLimitName>(MCP_RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!name) return true;
    const { limit, windowMs } = LIMITS[name];
    const request = context.switchToHttp().getRequest<Request>();
    const key = addressBucket(resolveIp(request));
    const counters = this.store(name);
    const now = Date.now();
    let entry = counters.get(key);
    if (!entry || now - entry.firstAt >= windowMs) {
      counters.evict((candidate) => now - candidate.firstAt >= windowMs);
      entry = { count: 0, firstAt: now };
      counters.set(key, entry);
    }
    entry.count += name === 'mcp' ? requestCost(request) : 1;
    if (entry.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((entry.firstAt + windowMs - now) / 1000));
      context.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(retryAfter));
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  private store(name: McpRateLimitName): FixedWindowCounterStore<string, WindowCounterEntry> {
    let store = this.counters.get(name);
    if (!store) {
      store = new FixedWindowCounterStore<string, WindowCounterEntry>(10_000);
      this.counters.set(name, store);
    }
    return store;
  }
}
