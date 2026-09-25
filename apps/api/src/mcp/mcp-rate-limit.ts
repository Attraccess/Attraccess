import { NextFunction, Request, RequestHandler, Response } from 'express';

type Window = { count: number; expiresAt: number };

/** A small per-process IP rate limit for the standalone MCP HTTP routes. */
export function createMcpRateLimit(maxRequests: number, windowMs: number): RequestHandler {
  const windows = new Map<string, Window>();
  let nextCleanupAt = 0;

  return (request: Request, response: Response, next: NextFunction) => {
    const now = Date.now();
    if (now >= nextCleanupAt) {
      for (const [key, window] of windows) if (window.expiresAt <= now) windows.delete(key);
      nextCleanupAt = now + windowMs;
    }

    const key = request.ip || request.socket.remoteAddress || 'unknown';
    let window = windows.get(key);
    if (!window || window.expiresAt <= now) {
      window = { count: 0, expiresAt: now + windowMs };
      windows.set(key, window);
    }
    window.count += 1;

    const retryAfterSeconds = Math.max(1, Math.ceil((window.expiresAt - now) / 1000));
    response.setHeader('RateLimit-Limit', String(maxRequests));
    response.setHeader('RateLimit-Remaining', String(Math.max(0, maxRequests - window.count)));
    response.setHeader('RateLimit-Reset', String(Math.ceil(window.expiresAt / 1000)));
    if (window.count > maxRequests) {
      response.setHeader('Retry-After', String(retryAfterSeconds));
      response.status(429).json({ message: 'Too many requests' });
      return;
    }
    next();
  };
}
