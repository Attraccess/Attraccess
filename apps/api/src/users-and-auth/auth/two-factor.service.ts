import { BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { authenticator } from 'otplib';
import { AuthenticationDetail, AuthenticationType, Setting, User } from '@attraccess/database-entities';
import { TwoFactorPolicy } from './two-factor.dto';
import { ConfigService } from '@nestjs/config';
import { AppConfigType } from '../../config/app.config';

@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);
  private readonly policyParent = 'auth';
  private readonly policyKey = 'two_factor_policy';
  private readonly issuer: string;

  constructor(
    @InjectRepository(AuthenticationDetail)
    private readonly authenticationDetailRepository: Repository<AuthenticationDetail>,
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
    private readonly configService: ConfigService,
  ) {
    authenticator.options = { window: 1 };
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

    const secret = authenticator.generateSecret();
    const accountName = user.email ?? user.username;
    const otpauthUrl = authenticator.keyuri(accountName, this.issuer, secret);

    if (existing) {
      existing.totpSecret = secret;
      existing.totpEnabledAt = null;
      await this.authenticationDetailRepository.save(existing);
    } else {
      const detail = new AuthenticationDetail();
      detail.userId = user.id;
      detail.type = AuthenticationType.TOTP;
      detail.totpSecret = secret;
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

    if (!this.isCodeValid(detail.totpSecret, code)) {
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

    if (!this.isCodeValid(detail.totpSecret, code)) {
      throw new UnauthorizedException('TwoFactorInvalidCode');
    }

    await this.authenticationDetailRepository.delete(detail.id);
  }

  async assertTwoFactorForLogin(user: User, code: string | undefined): Promise<void> {
    const [detail, policy] = await Promise.all([this.getTwoFactorDetail(user.id), this.getPolicy()]);
    const enabled = !!detail?.totpEnabledAt && !!detail?.totpSecret;
    const required = this.isPolicyRequiredForUser(policy, user);

    if (!enabled) {
      if (required) {
        throw new ForbiddenException('TwoFactorSetupRequired');
      }
      return;
    }

    if (!code) {
      throw new UnauthorizedException('TwoFactorRequired');
    }

    if (!this.isCodeValid(detail.totpSecret, code)) {
      throw new UnauthorizedException('TwoFactorInvalidCode');
    }
  }

  private async getTwoFactorDetail(userId: number): Promise<AuthenticationDetail | null> {
    return this.authenticationDetailRepository.findOne({
      where: { userId, type: AuthenticationType.TOTP },
    });
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

  private isCodeValid(secret: string, code: string): boolean {
    const trimmed = this.normalizeCode(code);
    return authenticator.check(trimmed, secret);
  }

  private normalizeCode(code: string): string {
    return (code ?? '').replace(/\s+/g, '');
  }
}
