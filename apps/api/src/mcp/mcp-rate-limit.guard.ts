import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { KeyedFixedWindowLimiter } from '../common/rate-limiting/keyed-fixed-window-limiter';
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
 * the other in-memory limiters.
 */
@Injectable()
export class McpRateLimitGuard implements CanActivate {
  private readonly limiter = new KeyedFixedWindowLimiter(LIMITS);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const name = this.reflector.getAllAndOverride<McpRateLimitName>(MCP_RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!name) return true;
    const request = context.switchToHttp().getRequest<Request>();
    this.limiter.hit(context, name, addressBucket(resolveIp(request)), name === 'mcp' ? requestCost(request) : 1);
    return true;
  }
}
