import type { TotpCredentialRecord } from '@attraccess/application-models';

import { Inject, Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { identityAuditEvent } from '../../audit/policies/identity';
import { AUDIT_RECORDER, AuditOrigin, AuditRecorder } from '../../audit/recorder/audit-event';

import { EncryptionService } from '../../encryption/encryption.service';

import { MetricsService } from '../../metrics/metrics.service';

import { SettingsService } from '../../settings/settings.service';

import { SETTINGS_ROWS, SettingsRows } from '../../settings/settings-rows.port';

import { TOTP_STORE, TotpStore } from './credentials/credential-store.port';

import { TwoFactorPolicy } from './two-factor.dto';

import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

/** The account a two-factor operation is about. Request principals and stored accounts both fit. */
export interface TwoFactorUser {
  id: number;
  username: string;
  email?: string | null;
}

@Injectable()
export class TwoFactorService {
  constructor(
    @Inject(TOTP_STORE) protected readonly totpStore: TotpStore,
    @Inject(SETTINGS_ROWS) protected readonly settingRows: SettingsRows,
    protected readonly settingsService: SettingsService,
    protected readonly encryptionService: EncryptionService,
    protected readonly metricsService: MetricsService,
    @Inject(AUDIT_RECORDER) protected readonly audit: AuditRecorder,
  ) {}

  protected readonly logger = new Logger(TwoFactorService.name);

  protected readonly policyParent = 'auth';

  protected readonly policyKey = 'two_factor_policy';

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

  async getStatus(user: TwoFactorUser): Promise<{ enabled: boolean; required: boolean; policy: TwoFactorPolicy }> {
    const [policy, detail] = await Promise.all([this.getPolicy(), this.getTwoFactorDetail(user.id)]);
    const enabled = !!detail?.enabledAt;

    return {
      enabled,
      policy,
      required: this.isPolicyRequiredForUser(policy, user),
    };
  }

  async assertTwoFactorForLogin(user: TwoFactorUser, code: string | undefined): Promise<void> {
    // Only validate a code if the user has already enabled 2FA.
    // Policy enforcement for users without 2FA happens at the session layer.
    const detail = await this.getTwoFactorDetail(user.id);
    const enabled = !!detail?.enabledAt && !!detail?.encryptedSecret;

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

  protected async getTwoFactorDetail(userId: number): Promise<TotpCredentialRecord | null> {
    return this.totpStore.find(userId);
  }

  /**
   * Returns the TOTP secret for verification. Assumes stored values are already
   * encrypted (see migration EncryptSensitiveData).
   */
  protected resolveTotpSecret(detail: TotpCredentialRecord): string | null {
    if (!detail.encryptedSecret) {
      return null;
    }
    return this.encryptionService.decryptIfEncrypted(detail.encryptedSecret) ?? detail.encryptedSecret;
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
    const value = await this.settingRows.findValue(this.policyParent, this.policyKey);

    if (value && Object.values(TwoFactorPolicy).includes(value as TwoFactorPolicy)) {
      return value as TwoFactorPolicy;
    }

    return TwoFactorPolicy.OPTIONAL;
  }

  async setPolicy(policy: TwoFactorPolicy): Promise<void> {
    await this.settingRows.upsertValue(this.policyParent, this.policyKey, policy);
  }

  protected isPolicyRequiredForUser(policy: TwoFactorPolicy, user: TwoFactorUser): boolean {
    if (policy === TwoFactorPolicy.REQUIRED_FOR_ALL) {
      return true;
    }

    if (policy === TwoFactorPolicy.REQUIRED_FOR_PRIVILEGED) {
      return this.isPrivilegedUser(user);
    }

    return false;
  }

  protected isPrivilegedUser(user: TwoFactorUser): boolean {
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

  async createSetup(user: TwoFactorUser, origin: AuditOrigin): Promise<{ secret: string; otpauthUrl: string }> {
    const existing = await this.getTwoFactorDetail(user.id);
    if (existing?.enabledAt) {
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

    await this.totpStore.saveSetup(user.id, encryptedSecret);

    this.metricsService.auth2faUsageTotal.inc({ action: 'setup' });
    await this.audit.record(identityAuditEvent('two_factor_setup_started', origin, { id: user.id }));
    return { secret, otpauthUrl };
  }

  async enable(user: TwoFactorUser, code: string, origin: AuditOrigin): Promise<void> {
    const detail = await this.getTwoFactorDetail(user.id);
    if (!detail?.encryptedSecret) {
      throw new BadRequestException('TwoFactorNotInitialized');
    }
    if (detail.enabledAt) {
      throw new BadRequestException('TwoFactorAlreadyEnabled');
    }

    const secret = this.resolveTotpSecret(detail);
    if (!secret || !(await this.isCodeValid(secret, code))) {
      throw new UnauthorizedException('TwoFactorInvalidCode');
    }

    await this.totpStore.markEnabled(detail.id, new Date());
    this.metricsService.auth2faUsageTotal.inc({ action: 'enable' });
    await this.audit.record(identityAuditEvent('two_factor_enabled', origin, { id: user.id }));
  }

  async disable(user: TwoFactorUser, code: string, origin: AuditOrigin): Promise<void> {
    const detail = await this.getTwoFactorDetail(user.id);
    if (!detail?.encryptedSecret || !detail.enabledAt) {
      throw new BadRequestException('TwoFactorNotEnabled');
    }

    const secret = this.resolveTotpSecret(detail);
    if (!secret || !(await this.isCodeValid(secret, code))) {
      throw new UnauthorizedException('TwoFactorInvalidCode');
    }

    await this.totpStore.remove(detail.id);
    this.metricsService.auth2faUsageTotal.inc({ action: 'disable' });
    await this.audit.record(identityAuditEvent('two_factor_disabled', origin, { id: user.id }));
  }
}
