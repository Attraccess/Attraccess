import { HEADER_AUTHORIZATION, SERVICE_TOKEN_PATTERN } from '@attraccess/matter-contract';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import type { Logger } from './logger';

const BEARER = /^Bearer ([^\s]+)$/i;
const LOG_INTERVAL_MS = 10_000;

const digest = (value: string) => createHash('sha256').update(value).digest();

export type AuthFailure = 'missing' | 'malformed' | 'invalid';

/**
 * Checks `Authorization: Bearer <token>` against the current and, while rotating, the previous token. Tokens are
 * compared as SHA-256 digests in constant time, and every accepted token is always compared so the time does not
 * reveal which one matched.
 */
export class TokenAuthenticator {
  private readonly digests: Buffer[];
  private lastLoggedAt = Number.NEGATIVE_INFINITY;
  private suppressed = 0;

  constructor(
    tokens: readonly string[],
    private readonly logger: Logger,
    private readonly now: () => number = Date.now,
  ) {
    this.digests = tokens.map(digest);
  }

  /** Why the request is refused, or null when it is authenticated. Logs the refusal (rate-limited, never the value). */
  check(headers: IncomingHttpHeaders, remoteAddress?: string): AuthFailure | null {
    const failure = this.evaluate(headers);
    if (failure) this.logFailure(failure, remoteAddress);
    return failure;
  }

  private evaluate(headers: IncomingHttpHeaders): AuthFailure | null {
    const header = headers[HEADER_AUTHORIZATION];
    if (header === undefined) return 'missing';
    const token = typeof header === 'string' ? BEARER.exec(header)?.[1] : undefined;
    if (token === undefined || !SERVICE_TOKEN_PATTERN.test(token)) return 'malformed';
    const candidate = digest(token);
    let matched = false;
    for (const accepted of this.digests) matched = timingSafeEqual(accepted, candidate) || matched;
    return matched ? null : 'invalid';
  }

  private logFailure(reason: AuthFailure, remoteAddress?: string): void {
    const at = this.now();
    if (at - this.lastLoggedAt < LOG_INTERVAL_MS) {
      this.suppressed += 1;
      return;
    }
    this.lastLoggedAt = at;
    const suppressed = this.suppressed;
    this.suppressed = 0;
    this.logger('warn', 'authentication failed', {
      reason,
      ...(remoteAddress ? { remoteAddress } : {}),
      ...(suppressed > 0 ? { suppressedSinceLast: suppressed } : {}),
    });
  }
}

export const UNAUTHORIZED_MESSAGE = 'A valid service token is required: send "Authorization: Bearer <token>".';
