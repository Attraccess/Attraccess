import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticationDetail, AuthenticationType, Setting, User } from '@attraccess/database-entities';
import { TwoFactorPolicy } from './two-factor.dto';
import { ConfigService } from '@nestjs/config';
import { AppConfigType } from '../../config/app.config';
import { EncryptionService } from '../../encryption/encryption.service';

@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);
  private readonly policyParent = 'auth';
  private readonly policyKey = 'two_factor_policy';
  private readonly issuer: string;
  private otplibPromise: Promise<typeof import('otplib')> | null = null;

  constructor(
    @InjectRepository(AuthenticationDetail)
    private readonly authenticationDetailRepository: Repository<AuthenticationDetail>,
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
  ) {
    this.issuer = this.resolveIssuer();
  }

  private resolveIssuer(): string {
    const appConfig = this.configService.get<AppConfigType>('app');
    if (!appConfig?.ATTRACCESS_URL) {
      return 'Attraccess';
    }

    try {
      const url = new URL(appConfig.ATTRACCESS_URL);
      return `Attraccess (${url.hostname})`;
    } catch (error) {
      this.logger.warn('Failed to parse ATTRACCESS_URL for 2FA issuer', error as Error);
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
    const secret = generateSecret();
    const encryptedSecret = this.encryptionService.encrypt(secret);
    const accountName = user.email ?? user.username;
    const otpauthUrl = generateURI({
      secret,
      label: accountName,
      issuer: this.issuer,
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

    const secret = await this.resolveTotpSecret(detail);
    if (!secret || !(await this.isCodeValid(secret, code))) {
      throw new UnauthorizedException('TwoFactorInvalidCode');
    }

    detail.totpEnabledAt = new Date();
    await this.authenticationDetailRepository.save(detail);
  }

  async disable(user: User, code: string): Promise<void> {
    const detail = await this.getTwoFactorDetail(user.id);
    if (!detail?.totpSecret || !detail.totpEnabledAt) {
      throw new BadRequestException('TwoFactorNotEnabled');
    }

    const secret = await this.resolveTotpSecret(detail);
    if (!secret || !(await this.isCodeValid(secret, code))) {
      throw new UnauthorizedException('TwoFactorInvalidCode');
    }

    await this.authenticationDetailRepository.delete(detail.id);
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

    const secret = detail ? await this.resolveTotpSecret(detail) : null;
    if (!secret || !(await this.isCodeValid(secret, code))) {
      throw new UnauthorizedException('TwoFactorInvalidCode');
    }
  }

  private async getTwoFactorDetail(userId: number): Promise<AuthenticationDetail | null> {
    return this.authenticationDetailRepository.findOne({
      where: { userId, type: AuthenticationType.TOTP },
    });
  }

  private async resolveTotpSecret(detail: AuthenticationDetail): Promise<string | null> {
    if (!detail.totpSecret) {
      return null;
    }

    if (this.encryptionService.isEncrypted(detail.totpSecret)) {
      return this.encryptionService.decrypt(detail.totpSecret);
    }

    const plaintext = detail.totpSecret;
    const encrypted = this.encryptionService.encrypt(plaintext);
    detail.totpSecret = encrypted;
    await this.authenticationDetailRepository.update(detail.id, { totpSecret: encrypted });
    return plaintext;
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
    if (!user?.systemPermissions) {
      return false;
    }
    return Object.values(user.systemPermissions).some((value) => value === true);
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
