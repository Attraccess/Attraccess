// HIBP Pwned Passwords client using SHA-1 k-anonymity range API
// FEATURE: Password policy HIBP breach corpus check, fails open on errors

import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { loadEnv } from '@attraccess/env';

const HIBP_DEFAULT_URL = 'https://api.pwnedpasswords.com/range/';
const HIBP_DEFAULT_TIMEOUT_MS = 2000;

export interface HibpLookupResult {
  pwned: boolean;
  count: number;
  available: boolean;
}

@Injectable()
export class HibpClient {
  private readonly logger = new Logger(HibpClient.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor() {
    const env = loadEnv((z) => ({
      HIBP_BASE_URL: z.string().url().default(HIBP_DEFAULT_URL),
      HIBP_TIMEOUT_MS: z.coerce.number().int().positive().default(HIBP_DEFAULT_TIMEOUT_MS),
    }));
    this.baseUrl = env.HIBP_BASE_URL.endsWith('/') ? env.HIBP_BASE_URL : `${env.HIBP_BASE_URL}/`;
    this.timeoutMs = env.HIBP_TIMEOUT_MS;
  }

  public async check(password: string): Promise<HibpLookupResult> {
    const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${prefix}`, {
        signal: controller.signal,
        headers: { 'Add-Padding': 'true' },
      });
      if (!response.ok) {
        this.logger.warn(`HIBP responded with status ${response.status}; failing open`);
        return { pwned: false, count: 0, available: false };
      }
      const text = await response.text();
      for (const line of text.split(/\r?\n/)) {
        const [hashSuffix, countStr] = line.split(':');
        if (hashSuffix?.trim().toUpperCase() === suffix) {
          const count = Number.parseInt((countStr ?? '0').trim(), 10);
          if (count > 0) {
            return { pwned: true, count, available: true };
          }
        }
      }
      return { pwned: false, count: 0, available: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`HIBP lookup failed; failing open: ${reason}`);
      return { pwned: false, count: 0, available: false };
    } finally {
      clearTimeout(timer);
    }
  }
}
