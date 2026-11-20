import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { McpRateLimitGuard, McpRateLimitName } from './mcp-rate-limit.guard';

describe('McpRateLimitGuard', () => {
  let now = 1_000_000;
  beforeEach(() => jest.spyOn(Date, 'now').mockImplementation(() => now));
  afterEach(() => jest.restoreAllMocks());

  const call = (guard: McpRateLimitGuard, name: McpRateLimitName, ip = '192.0.2.10', body: unknown = {}) => {
    const reflector = { getAllAndOverride: () => name } as unknown as Reflector;
    Object.assign(guard, { reflector });
    const context = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ ip, body }), getResponse: () => ({ setHeader: jest.fn() }) }),
    } as unknown as ExecutionContext;
    try {
      return guard.canActivate(context);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429) return false;
      throw error;
    }
  };

  it('keeps the hourly registration window when a per-minute limit starts a new window', () => {
    const guard = new McpRateLimitGuard({} as Reflector);
    for (let i = 0; i < 20; i++) expect(call(guard, 'register')).toBe(true);
    expect(call(guard, 'register')).toBe(false);
    now += 61_000;
    // A discovery request opens a new per-minute window and evicts that limit's stale entries.
    expect(call(guard, 'authorize')).toBe(true);
    expect(call(guard, 'register')).toBe(false);
    now += 60 * 60_000;
    expect(call(guard, 'register')).toBe(true);
  });

  it('counts every message of a JSON-RPC batch against the MCP limit', () => {
    const guard = new McpRateLimitGuard({} as Reflector);
    const batch = Array.from({ length: 100 }, (_, id) => ({ jsonrpc: '2.0', id, method: 'tools/list' }));
    for (let i = 0; i < 6; i++) expect(call(guard, 'mcp', '192.0.2.10', batch)).toBe(true);
    expect(call(guard, 'mcp', '192.0.2.10', {})).toBe(false);
  });

  it('shares one budget across an IPv6 /64', () => {
    const guard = new McpRateLimitGuard({} as Reflector);
    for (let i = 0; i < 20; i++) expect(call(guard, 'register', `2001:db8:1:2::${i + 1}`)).toBe(true);
    expect(call(guard, 'register', '2001:db8:1:2:ffff::1')).toBe(false);
    expect(call(guard, 'register', '2001:db8:1:3::1')).toBe(true);
  });
});
