import { AuthenticationType } from '@attraccess/database-entities';

import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';

import { AuthAuditLogger } from '../../../rate-limiting/auth-audit.logger';

import { BruteForceProtectionService } from '../../../rate-limiting/brute-force.service';

import { UsersService } from '../../../users/users.service';

import { AuthService } from '../../auth.service';

import { SSOLinkTokenPayload, SSOLinkTokenService } from '../link-token.service';

/**
 * Links a local account to an SSO identity with a signed link token and the account password, after which the
 * account signs in through SSO only. Wrong tokens count per IP, wrong passwords per account.
 */
@Injectable()
export class SsoAccountLinkService {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly linkTokenService: SSOLinkTokenService,
    private readonly bruteForce: BruteForceProtectionService,
    private readonly authAudit: AuthAuditLogger,
  ) {}

  /** Invalid, expired, used or exhausted tokens feed the per-IP counters only. */
  async verifyLinkToken(token: string, ip: string): Promise<SSOLinkTokenPayload> {
    try {
      const payload = await this.linkTokenService.verify(token);
      await this.linkTokenService.assertUsable(payload);
      return payload;
    } catch (error) {
      return this.rejectLinkToken(error, ip);
    }
  }

  async link(linkPayload: SSOLinkTokenPayload, password: string, ip: string): Promise<{ OK: boolean }> {
    const email = linkPayload.email;
    const user = await this.usersService.findOne({ email }, ['authenticationDetails']);
    if (!user) {
      await this.bruteForce.recordFailure('sso_link_account', ip, null, email);
      await this.authAudit.log({ type: 'sso_link_account', outcome: 'unknown_user', ip, username: email });
      throw new UnauthorizedException();
    }

    return this.bruteForce.runAccountAttempt(user.id, async () => {
      try {
        await this.bruteForce.assertAccountAllowed(user);
      } catch (error) {
        await this.authAudit.log({
          type: 'sso_link_account',
          outcome: 'account_locked',
          ip,
          userId: user.id,
          username: email,
          reason: 'account_locked',
        });
        throw error;
      }

      // Earlier attempts queued on this account may have used up or consumed the token meanwhile.
      await this.assertLinkTokenUsable(linkPayload, ip);

      const existingSSODetail = await this.authService.findSSOAuthenticationDetail(user.id);
      if (existingSSODetail && existingSSODetail.providerId !== linkPayload.providerId) {
        throw new BadRequestException('SSO_ALREADY_LINKED');
      }

      const localAuth = user.authenticationDetails?.find((detail) => detail.type === AuthenticationType.LOCAL_PASSWORD);
      if (!localAuth) {
        throw new BadRequestException('PASSWORD_REQUIRED');
      }

      try {
        await this.linkTokenService.reservePasswordAttempt(linkPayload);
      } catch (error) {
        await this.rejectLinkToken(error, ip);
      }

      const isAuthenticated = await this.authService.validateAuthenticationDetails(user.id, {
        type: AuthenticationType.LOCAL_PASSWORD,
        details: {
          password,
        },
      });

      if (!isAuthenticated) {
        await this.bruteForce.recordFailure('sso_link_account', ip, user.id, email);
        await this.authAudit.log({
          type: 'sso_link_account',
          outcome: 'invalid_credentials',
          ip,
          userId: user.id,
          username: email,
        });
        throw new UnauthorizedException();
      }

      const existingSSOUserId = await this.authService.findUserIdBySSO(
        linkPayload.providerType,
        linkPayload.providerId,
        linkPayload.ssoSubject,
      );
      if (existingSSOUserId && existingSSOUserId !== user.id) {
        throw new BadRequestException('SSO_SUBJECT_ALREADY_LINKED');
      }

      // From here the token is spent, even if the writes below fail; the user restarts SSO sign-in.
      try {
        await this.linkTokenService.consume(linkPayload);
      } catch (error) {
        await this.rejectLinkToken(error, ip);
      }

      if (existingSSODetail) {
        await this.authService.updateSSOSubject(existingSSODetail.id, linkPayload.ssoSubject);
      } else {
        await this.authService.addAuthenticationDetails(user.id, {
          type: AuthenticationType.SSO,
          details: {
            providerType: linkPayload.providerType,
            providerId: linkPayload.providerId,
            subject: linkPayload.ssoSubject,
          },
        });
      }

      // Remove local password to enforce SSO-only after linking
      await this.authService.removeAuthenticationDetails(localAuth.id);
      await this.usersService.updateOne(user.id, { externalIdentifier: null });

      await this.bruteForce.recordSuccess('sso_link_account', ip, user.id, email);
      await this.authAudit.log({ type: 'sso_link_account', outcome: 'success', ip, userId: user.id, username: email });

      return { OK: true };
    });
  }

  private async assertLinkTokenUsable(payload: SSOLinkTokenPayload, ip: string): Promise<void> {
    try {
      await this.linkTokenService.assertUsable(payload);
    } catch (error) {
      await this.rejectLinkToken(error, ip);
    }
  }

  /**
   * A rejected token names no account, so it only feeds the coarse per-IP counter; other accounts behind the same IP
   * keep their own budget. Store or settings outages are not the caller's fault and pass through uncounted.
   */
  private async rejectLinkToken(error: unknown, ip: string): Promise<never> {
    if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
      await this.bruteForce.recordIpFailure('sso_link_account', ip);
      await this.authAudit.log({
        type: 'sso_link_account',
        outcome: 'invalid_token',
        ip,
        reason: error.message,
      });
    }
    throw error;
  }
}
