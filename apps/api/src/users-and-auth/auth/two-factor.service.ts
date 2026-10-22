import { AuthenticationDetail, AuthenticationType, User } from '@attraccess/application-models';

import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';

import { TwoFactorPersistence } from './persistence/port';

import { EncryptionService } from '../../encryption/encryption.service';

import { MetricsService } from '../../metrics/metrics.service';

import { SettingsService } from '../../settings/settings.service';

import { TwoFactorPolicy } from './two-factor.dto';

import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk/v2';

@Injectable()
export class TwoFactorService {
  constructor(
    protected readonly persistence: TwoFactorPersistence,
    protected readonly settingsService: SettingsService,
    protected readonly encryptionService: EncryptionService,
    protected readonly metricsService: MetricsService,
  ) {}

  protected readonly logger = new Logger(TwoFactorService.name);

  protected otplibPromise: Promise<typeof import('otplib')> | null = null;

  protected async resolveIssuer(): Promise<string> {
    const appUrl = await this.settingsService.getUrl();
    if (!appUrl) {
      return 'Attraccess';
    }

    try {
      const url = new URL(appUrl);
      return `Attraccess (${url.hostname})`;
    } catch (error) {
      this.logger.warn('Failed to parse backend URL for 2FA issuer', error as Error);
      return 'Attraccess';
    }
  }

  async getStatus(user: User): Promise<{ enabled: boolean; required: boolean; policy: TwoFactorPolicy }> {
    const [policy, detail] = await Promise.all([this.getPolicy(), this.getTwoFactorDetail(user.id)]);
    const enabled = !!detail?.totpEnabledAt;

    return {
      enabled,
      policy,
      required: this.isPolicyRequiredForUser(policy, user),
    };
  }

  async assertTwoFactorForLogin(user: User, code: string | undefined): Promise<void> {
    // Only validate a code if the user has already enabled 2FA.
    // Policy enforcement for users without 2FA happens at the session layer.
    const detail = await this.getTwoFactorDetail(user.id);
    const enabled = !!detail?.totpEnabledAt && !!detail?.totpSecret;

    if (!enabled) {
      return;
    }

    if (!code) {
      throw new UnauthorizedException('TwoFactorRequired');
    }

    const secret = detail ? this.resolveTotpSecret(detail) : null;
    if (!secret || !(await this.isCodeValid(secret, code))) {
      throw new UnauthorizedException('TwoFactorInvalidCode');
    }
  }

  protected async getTwoFactorDetail(userId: number): Promise<AuthenticationDetail | null> {
    return this.persistence.findDetail(userId);
  }

  /**
   * Returns the TOTP secret for verification. Assumes stored values are already
   * encrypted (see migration EncryptSensitiveData).
   */
  protected resolveTotpSecret(detail: AuthenticationDetail): string | null {
    if (!detail.totpSecret) {
      return null;
    }
    return this.encryptionService.decryptIfEncrypted(detail.totpSecret) ?? detail.totpSecret;
  }

  protected async isCodeValid(secret: string, code: string): Promise<boolean> {
    const trimmed = this.normalizeCode(code);
    const { verify } = await this.loadOtplib();
    const result = await verify({
      secret,
      token: trimmed,
      strategy: 'totp',
      epochTolerance: 30,
    });
    return typeof result === 'boolean' ? result : result.valid;
  }

  protected async loadOtplib(): Promise<typeof import('otplib')> {
    if (!this.otplibPromise) {
      this.otplibPromise = import('otplib');
    }
    return this.otplibPromise;
  }

  protected normalizeCode(code: string): string {
    return (code ?? '').replace(/\s+/g, '');
  }

  async getPolicy(): Promise<TwoFactorPolicy> {
    const value = await this.persistence.readPolicy();
    if (value && Object.values(TwoFactorPolicy).includes(value as TwoFactorPolicy)) return value as TwoFactorPolicy;

    return TwoFactorPolicy.OPTIONAL;
  }

  async setPolicy(policy: TwoFactorPolicy): Promise<void> {
    await this.persistence.writePolicy(policy);
  }

  protected isPolicyRequiredForUser(policy: TwoFactorPolicy, user: User): boolean {
    if (policy === TwoFactorPolicy.REQUIRED_FOR_ALL) {
      return true;
    }

    if (policy === TwoFactorPolicy.REQUIRED_FOR_PRIVILEGED) {
      return this.isPrivilegedUser(user);
    }

    return false;
  }

  protected isPrivilegedUser(user: User): boolean {
    const effectivePerms = (user as AuthenticatedUser).effectivePermissions;
    if (!effectivePerms) {
      this.logger.warn(
        `isPrivilegedUser: effectivePermissions missing for user ${user.id} — treating as not privileged`,
      );
      return false;
    }
    if (effectivePerms.size === 0) return false;
    // privileged = holds any permission outside the basic resources.* namespace
    // (avoids coupling to seed-data assumptions about which permissions the default role carries)
    return [...effectivePerms].some((p) => !p.startsWith('resources.'));
  }

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
      await this.persistence.saveDetail(existing);
    } else {
      await this.persistence.saveDetail({
        userId: user.id,
        type: AuthenticationType.TOTP,
        totpSecret: encryptedSecret,
        totpEnabledAt: null,
      });
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
    await this.persistence.saveDetail(detail);
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

    await this.persistence.removeDetail(detail.id);
    this.metricsService.auth2faUsageTotal.inc({ action: 'disable' });
  }
}
