import { Injectable } from '@nestjs/common';

import { AuthAuditLogger } from '../../rate-limiting/auth-audit.logger';

import { BruteForceProtectionService } from '../../rate-limiting/brute-force.service';
import type { RateLimitScope } from '../../rate-limiting/brute-force-policy';

/** The per-IP throttle in front of SSO account linking and provisioning, audited when it refuses a request. */
@Injectable()
export class SsoIpThrottleService {
  constructor(
    private readonly bruteForce: BruteForceProtectionService,
    private readonly authAudit: AuthAuditLogger,
  ) {}

  /** Throws 429 while the IP is throttled for this account (or, with no username, at all). */
  async assertIpAllowed(
    type: Extract<RateLimitScope, 'sso_link_account' | 'sso_provisioning'>,
    ip: string,
    username: string | null,
  ): Promise<void> {
    try {
      await this.bruteForce.assertIpAllowed(type, ip, username);
    } catch (error) {
      await this.authAudit.log({ type, outcome: 'rate_limited', ip, username, reason: 'ip_throttled' });
      throw error;
    }
  }
}
