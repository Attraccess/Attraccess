import { AuthenticationDetail, AuthenticationType, Setting, User } from '@attraccess/database-entities';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncryptionService } from '../../encryption/encryption.service';
import { MetricsService } from '../../metrics/metrics.service';
import { SettingsService } from '../../settings/settings.service';
import { TwoFactorPolicyImplementation } from './two-factor-policy';
import { TwoFactorPolicy } from './two-factor.dto';

@Injectable()
export class TwoFactorService extends TwoFactorPolicyImplementation {
  protected readonly logger = new Logger(TwoFactorService.name);
  protected readonly policyParent = 'auth';
  protected readonly policyKey = 'two_factor_policy';
  protected otplibPromise: Promise<typeof import('otplib')> | null = null;

  constructor(
    @InjectRepository(AuthenticationDetail)
    protected readonly authenticationDetailRepository: Repository<AuthenticationDetail>,
    @InjectRepository(Setting)
    protected readonly settingRepository: Repository<Setting>,
    protected readonly settingsService: SettingsService,
    protected readonly encryptionService: EncryptionService,
    protected readonly metricsService: MetricsService,
  ) {
    super();
  }

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
    return this.authenticationDetailRepository.findOne({
      where: { userId, type: AuthenticationType.TOTP },
    });
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
}
