import { AuthenticationDetail, AuthenticationType, User } from '@attraccess/database-entities';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { TwoFactorServiceRouteContext } from './two-factor.service.route-context';
export abstract class TwoFactorEnrollmentImplementation extends TwoFactorServiceRouteContext {
  async createSetup(user: User): Promise<{ secret: string; otpauthUrl: string }> {
    const existing = await this.getTwoFactorDetail(user.id);
    if (existing?.totpEnabledAt) {
      throw new BadRequestException('TwoFactorAlreadyEnabled');
    }

    const { generateSecret, generateURI } = await this.loadOtplib();
    const issuer = await this.resolveIssuer();
    const secret = generateSecret();
    const encryptedSecret = this.encryptionService.encrypt(secret);
    const accountName = user.email ?? user.username;
    const otpauthUrl = generateURI({
      secret,
      label: accountName,
      issuer,
      strategy: 'totp',
    });

    if (existing) {
      existing.totpSecret = encryptedSecret;
      existing.totpEnabledAt = null;
      await this.authenticationDetailRepository.save(existing);
    } else {
      const detail = new AuthenticationDetail();
      detail.userId = user.id;
      detail.type = AuthenticationType.TOTP;
      detail.totpSecret = encryptedSecret;
      detail.totpEnabledAt = null;
      await this.authenticationDetailRepository.save(detail);
    }

    this.metricsService.auth2faUsageTotal.inc({ action: 'setup' });
    return { secret, otpauthUrl };
  }

  async enable(user: User, code: string): Promise<void> {
    const detail = await this.getTwoFactorDetail(user.id);
    if (!detail?.totpSecret) {
      throw new BadRequestException('TwoFactorNotInitialized');
    }
    if (detail.totpEnabledAt) {
      throw new BadRequestException('TwoFactorAlreadyEnabled');
    }

    const secret = this.resolveTotpSecret(detail);
    if (!secret || !(await this.isCodeValid(secret, code))) {
      throw new UnauthorizedException('TwoFactorInvalidCode');
    }

    detail.totpEnabledAt = new Date();
    await this.authenticationDetailRepository.save(detail);
    this.metricsService.auth2faUsageTotal.inc({ action: 'enable' });
  }

  async disable(user: User, code: string): Promise<void> {
    const detail = await this.getTwoFactorDetail(user.id);
    if (!detail?.totpSecret || !detail.totpEnabledAt) {
      throw new BadRequestException('TwoFactorNotEnabled');
    }

    const secret = this.resolveTotpSecret(detail);
    if (!secret || !(await this.isCodeValid(secret, code))) {
      throw new UnauthorizedException('TwoFactorInvalidCode');
    }

    await this.authenticationDetailRepository.delete(detail.id);
    this.metricsService.auth2faUsageTotal.inc({ action: 'disable' });
  }
}
