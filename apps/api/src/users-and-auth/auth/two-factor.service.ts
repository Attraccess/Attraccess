import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticationDetail, AuthenticationType, Setting, User } from '@attraccess/database-entities';
import { TwoFactorPolicy } from './two-factor.dto';
import { SettingsService } from '../../settings/settings.service';
import { EncryptionService } from '../../encryption/encryption.service';
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);
  private readonly policyParent = 'auth';
  private readonly policyKey = 'two_factor_policy';
  private otplibPromise: Promise<typeof import('otplib')> | null = null;

  constructor(
    @InjectRepository(AuthenticationDetail)
    private readonly authenticationDetailRepository: Repository<AuthenticationDetail>,
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
    private readonly settingsService: SettingsService,
    private readonly encryptionService: EncryptionService,
    private readonly metricsService: MetricsService,
  ) {
  }

  private async resolveIssuer(): Promise<string> {
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

  async getPolicy(): Promise<TwoFactorPolicy> {
    const setting = await this.settingRepository.findOneBy({
      parent: this.policyParent,
      key: this.policyKey,
    });

    if (setting?.value && Object.values(TwoFactorPolicy).includes(setting.value as TwoFactorPolicy)) {
      return setting.value as TwoFactorPolicy;
    }

    return TwoFactorPolicy.OPTIONAL;
  }

  async setPolicy(policy: TwoFactorPolicy): Promise<void> {
    const existing = await this.settingRepository.findOneBy({
      parent: this.policyParent,
      key: this.policyKey,
    });

    if (existing) {
      await this.settingRepository.update(existing.id, {
        value: policy,
      });
      return;
    }

    await this.settingRepository.insert({
      parent: this.policyParent,
      key: this.policyKey,
      value: policy,
    });
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

  private async getTwoFactorDetail(userId: number): Promise<AuthenticationDetail | null> {
    return this.authenticationDetailRepository.findOne({
      where: { userId, type: AuthenticationType.TOTP },
    });
  }

  /**
   * Returns the TOTP secret for verification. Assumes stored values are already
   * encrypted (see migration EncryptSensitiveData).
   */
  private resolveTotpSecret(detail: AuthenticationDetail): string | null {
    if (!detail.totpSecret) {
      return null;
    }
    return (
      this.encryptionService.decryptIfEncrypted(detail.totpSecret) ?? detail.totpSecret
    );
  }

  private isPolicyRequiredForUser(policy: TwoFactorPolicy, user: User): boolean {
    if (policy === TwoFactorPolicy.REQUIRED_FOR_ALL) {
      return true;
    }

    if (policy === TwoFactorPolicy.REQUIRED_FOR_PRIVILEGED) {
      return this.isPrivilegedUser(user);
    }

    return false;
  }

  private isPrivilegedUser(user: User): boolean {
    const effectivePerms = (user as any).effectivePermissions as Set<string> | undefined;
    if (!effectivePerms) return false;
    // Any permission beyond the default 'resources.read' (granted to all users) is considered privileged
    const PRIVILEGED = ['resources.create', 'resources.update', 'users.create', 'system.settings.manage', 'billing.manage'];
    return PRIVILEGED.some((p) => effectivePerms.has(p));
  }

  private async isCodeValid(secret: string, code: string): Promise<boolean> {
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

  private async loadOtplib(): Promise<typeof import('otplib')> {
    if (!this.otplibPromise) {
      this.otplibPromise = import('otplib');
    }
    return this.otplibPromise;
  }

  private normalizeCode(code: string): string {
    return (code ?? '').replace(/\s+/g, '');
  }
}
