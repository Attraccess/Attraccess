import { auditSettingsUpdateSchema, readAuditSettings } from '../audit/audit.config';
import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { AppSettingsDto } from './dto/app-settings.dto';
import { SmtpServiceType, SmtpSettingsDto } from './dto/smtp-settings.dto';
import { UpdateAppSettingsDto } from './dto/update-app-settings.dto';
import { UpdateSmtpSettingsDto } from './dto/update-smtp-settings.dto';
import { SystemSettingsDto } from './dto/system-settings.dto';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { SmtpSettingsInternal, SmtpSettingsService } from './smtp-settings.service';
import {
  APP_KEYS,
  APP_PARENT,
  AUTH_KEYS,
  AUTH_PARENT,
  METRICS_KEYS,
  METRICS_PARENT,
  METRICS_SLOW_QUERY_THRESHOLD_DEFAULT_SECONDS,
  METRICS_TOGGLE_DEFAULTS,
  METRICS_TOGGLE_KEYS,
  MetricsSubsystem,
  MESSAGING_KEYS,
  MESSAGING_PARENT,
  MESSAGING_RATE_LIMIT_DEFAULTS,
  MessagingRateLimitPolicy,
  RATE_LIMIT_DEFAULTS,
  RateLimitPolicy,
} from './constants';
import { AuthRateLimitSettingsDto } from './dto/auth-rate-limit-settings.dto';
import { UpdateAuthRateLimitSettingsDto } from './dto/update-auth-rate-limit-settings.dto';
import { MessagingRateLimitSettingsDto } from './dto/messaging-rate-limit-settings.dto';
import { UpdateMessagingRateLimitSettingsDto } from './dto/update-messaging-rate-limit-settings.dto';
import { SettingsStoreService } from './settings-store.service';
import {
  FirstTimeSetupStatusDto,
  FirstTimeSetupStepsDto,
} from './dto/first-time-setup-status.dto';
import { MetricsTogglesDto } from './dto/metrics-toggles.dto';
import { UpdateMetricsTogglesDto } from './dto/update-metrics-toggles.dto';
import { METRICS_TOGGLE_INVALIDATOR, MetricsToggleInvalidator } from './metrics-toggle-invalidator.token';

@Injectable()
export class SettingsService {
  getAuditSettings() {
    return readAuditSettings(this.settingsStore);
  }

  async updateAuditSettings(update: unknown) {
    const parsed = auditSettingsUpdateSchema.safeParse(update);
    if (!parsed.success) throw new BadRequestException('Invalid audit settings');
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) await this.settingsStore.setPlainSetting('audit', key, JSON.stringify(value));
    }
    return this.getAuditSettings();
  }

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly settingsStore: SettingsStoreService,
    private readonly smtpSettingsService: SmtpSettingsService,
    @Optional()
    @Inject(METRICS_TOGGLE_INVALIDATOR)
    private readonly metricsToggleInvalidator: MetricsToggleInvalidator | null = null,
  ) {}

  async isFirstTimeSetupAvailable(): Promise<boolean> {
    const count = await this.userRepository.count();
    return count === 0;
  }

  async getFirstTimeSetupStatus(): Promise<FirstTimeSetupStatusDto> {
    const [app, smtp, userCount, verifiedAdminCount] = await Promise.all([
      this.getAppSettings(),
      this.smtpSettingsService.getSettings(),
      this.userRepository.count(),
      this.userRepository.count({ where: { isEmailVerified: true } }),
    ]);

    const adminEmailVerified = userCount > 0 && verifiedAdminCount > 0;

    const stepsCompleted: FirstTimeSetupStepsDto = {
      app:
        !!app.url?.trim() &&
        app.licenseKeyConfigured === true,
      smtp:
        !!smtp.from?.trim() &&
        (!smtp.passConfigured || !!smtp.user?.trim()) &&
        (smtp.service === SmtpServiceType.Outlook365 ||
          (smtp.service === SmtpServiceType.SMTP && !!smtp.host?.trim() && !!smtp.port)),
      admin: userCount > 0,
      adminEmailVerified,
    };

    return {
      available: userCount === 0 || (userCount === 1 && !adminEmailVerified),
      stepsCompleted,
    };
  }

  async getSystemSettings(): Promise<SystemSettingsDto> {
    const [app, smtp] = await Promise.all([this.getAppSettings(), this.smtpSettingsService.getSettings()]);
    return { app, smtp };
  }

  async updateSystemSettings(update: UpdateSystemSettingsDto): Promise<SystemSettingsDto> {
    if (update.app) {
      await this.updateAppSettings(update.app);
    }
    if (update.smtp) {
      await this.updateSmtpSettings(update.smtp);
    }
    return this.getSystemSettings();
  }

  async getAppSettings(): Promise<AppSettingsDto> {
    const [url, publicInternetUrl, licenseKey] = await Promise.all([
      this.settingsStore.getPlainSetting(APP_PARENT, APP_KEYS.url),
      this.settingsStore.getPlainSetting(APP_PARENT, APP_KEYS.publicInternetUrl),
      this.settingsStore.getSecretSetting(APP_PARENT, APP_KEYS.licenseKey),
    ]);

    return {
      url,
      publicInternetUrl,
      licenseKeyConfigured: licenseKey.configured,
    };
  }

  async updateAppSettings(update: UpdateAppSettingsDto): Promise<void> {
    if (Object.prototype.hasOwnProperty.call(update, 'url')) {
      await this.settingsStore.setPlainSetting(APP_PARENT, APP_KEYS.url, update.url ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(update, 'publicInternetUrl')) {
      await this.settingsStore.setPlainSetting(APP_PARENT, APP_KEYS.publicInternetUrl, update.publicInternetUrl ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(update, 'licenseKey')) {
      await this.settingsStore.setSecretSetting(APP_PARENT, APP_KEYS.licenseKey, update.licenseKey ?? null);
    }
  }

  async getSmtpSettings(): Promise<SmtpSettingsDto> {
    return this.smtpSettingsService.getSettings();
  }

  async updateSmtpSettings(update: UpdateSmtpSettingsDto): Promise<void> {
    return this.smtpSettingsService.updateSettings(update);
  }

  async getUrl(): Promise<string | null> {
    return this.settingsStore.getPlainSetting(APP_PARENT, APP_KEYS.url);
  }

  async getPublicInternetUrl(): Promise<string | null> {
    return this.settingsStore.getPlainSetting(APP_PARENT, APP_KEYS.publicInternetUrl);
  }

  async getLicenseKey(): Promise<string | null> {
    const licenseKey = await this.settingsStore.getSecretSetting(APP_PARENT, APP_KEYS.licenseKey);
    return licenseKey.value;
  }

  async getSmtpConfiguration(): Promise<SmtpSettingsInternal | null> {
    return this.smtpSettingsService.getConfiguration();
  }

  buildSmtpTransportOptions(config: SmtpSettingsInternal): SMTPTransport.Options {
    return this.smtpSettingsService.buildTransportOptions(config);
  }

  async getMetricsApiKey(): Promise<{ value: string | null; configured: boolean }> {
    return this.settingsStore.getSecretSetting(METRICS_PARENT, METRICS_KEYS.apiKey);
  }

  async setMetricsApiKey(apiKey: string | null): Promise<void> {
    await this.settingsStore.setSecretSetting(METRICS_PARENT, METRICS_KEYS.apiKey, apiKey);
  }

  async generateMetricsApiKey(): Promise<{ apiKey: string }> {
    const apiKey = randomBytes(32).toString('base64url');
    await this.settingsStore.setSecretSetting(METRICS_PARENT, METRICS_KEYS.apiKey, apiKey);
    return { apiKey };
  }

  async getMetricsToggles(): Promise<MetricsTogglesDto> {
    const subsystems = Object.keys(METRICS_TOGGLE_KEYS) as MetricsSubsystem[];
    const reads = await Promise.all(
      subsystems.map(async (subsystem) => {
        const raw = await this.settingsStore.getPlainSetting(METRICS_PARENT, METRICS_TOGGLE_KEYS[subsystem]);
        const value = raw === null || raw === undefined ? METRICS_TOGGLE_DEFAULTS[subsystem] : raw === 'true';
        return [subsystem, value] as const;
      }),
    );
    return reads.reduce<MetricsTogglesDto>((acc, [subsystem, value]) => {
      acc[subsystem] = value;
      return acc;
    }, {} as MetricsTogglesDto);
  }

  async getMetricsSlowQueryThresholdSeconds(): Promise<number> {
    const raw = await this.settingsStore.getPlainSetting(METRICS_PARENT, METRICS_KEYS.slowQueryThresholdSeconds);
    if (raw === null || raw === undefined || raw === '') {
      return METRICS_SLOW_QUERY_THRESHOLD_DEFAULT_SECONDS;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return METRICS_SLOW_QUERY_THRESHOLD_DEFAULT_SECONDS;
    }
    return parsed;
  }

  async setMetricsSlowQueryThresholdSeconds(value: number): Promise<void> {
    await this.settingsStore.setPlainSetting(METRICS_PARENT, METRICS_KEYS.slowQueryThresholdSeconds, String(value));
    if (this.metricsToggleInvalidator) {
      await this.metricsToggleInvalidator.refresh();
    }
  }

  async getAuthRateLimitSettings(): Promise<AuthRateLimitSettingsDto> {
    return this.resolveRateLimitPolicy();
  }

  async getRateLimitPolicy(): Promise<RateLimitPolicy> {
    return this.resolveRateLimitPolicy();
  }

  async updateAuthRateLimitSettings(update: UpdateAuthRateLimitSettingsDto): Promise<AuthRateLimitSettingsDto> {
    const writes: Array<Promise<void>> = [];
    if (update.maxAttempts !== undefined) {
      writes.push(
        this.settingsStore.setPlainSetting(AUTH_PARENT, AUTH_KEYS.rateLimitMaxAttempts, String(update.maxAttempts)),
      );
    }
    if (update.windowSeconds !== undefined) {
      writes.push(
        this.settingsStore.setPlainSetting(AUTH_PARENT, AUTH_KEYS.rateLimitWindowSeconds, String(update.windowSeconds)),
      );
    }
    if (update.lockoutDurationSeconds !== undefined) {
      writes.push(
        this.settingsStore.setPlainSetting(
          AUTH_PARENT,
          AUTH_KEYS.rateLimitLockoutDurationSeconds,
          String(update.lockoutDurationSeconds),
        ),
      );
    }
    if (update.exponentialBackoff !== undefined) {
      writes.push(
        this.settingsStore.setPlainSetting(
          AUTH_PARENT,
          AUTH_KEYS.rateLimitExponentialBackoff,
          update.exponentialBackoff ? 'true' : 'false',
        ),
      );
    }
    if (update.backoffMultiplier !== undefined) {
      writes.push(
        this.settingsStore.setPlainSetting(
          AUTH_PARENT,
          AUTH_KEYS.rateLimitBackoffMultiplier,
          String(update.backoffMultiplier),
        ),
      );
    }
    await Promise.all(writes);
    return this.resolveRateLimitPolicy();
  }

  private async resolveRateLimitPolicy(): Promise<RateLimitPolicy> {
    const [maxAttempts, windowSeconds, lockoutDurationSeconds, exponentialBackoff, backoffMultiplier] =
      await Promise.all([
        this.settingsStore.getPlainSetting(AUTH_PARENT, AUTH_KEYS.rateLimitMaxAttempts),
        this.settingsStore.getPlainSetting(AUTH_PARENT, AUTH_KEYS.rateLimitWindowSeconds),
        this.settingsStore.getPlainSetting(AUTH_PARENT, AUTH_KEYS.rateLimitLockoutDurationSeconds),
        this.settingsStore.getPlainSetting(AUTH_PARENT, AUTH_KEYS.rateLimitExponentialBackoff),
        this.settingsStore.getPlainSetting(AUTH_PARENT, AUTH_KEYS.rateLimitBackoffMultiplier),
      ]);

    return {
      maxAttempts: parsePositiveInt(maxAttempts, RATE_LIMIT_DEFAULTS.maxAttempts),
      windowSeconds: parsePositiveInt(windowSeconds, RATE_LIMIT_DEFAULTS.windowSeconds),
      lockoutDurationSeconds: parsePositiveInt(
        lockoutDurationSeconds,
        RATE_LIMIT_DEFAULTS.lockoutDurationSeconds,
      ),
      exponentialBackoff: exponentialBackoff === 'true',
      backoffMultiplier: parsePositiveFloat(backoffMultiplier, RATE_LIMIT_DEFAULTS.backoffMultiplier),
    };
  }

  async getMessagingRateLimitSettings(): Promise<MessagingRateLimitSettingsDto> {
    return this.resolveMessagingRateLimitPolicy();
  }

  async getMessagingRateLimitPolicy(): Promise<MessagingRateLimitPolicy> {
    return this.resolveMessagingRateLimitPolicy();
  }

  async updateMessagingRateLimitSettings(
    update: UpdateMessagingRateLimitSettingsDto,
  ): Promise<MessagingRateLimitSettingsDto> {
    const writes: Array<Promise<void>> = [];
    if (update.sendMaxPerWindow !== undefined) {
      writes.push(
        this.settingsStore.setPlainSetting(MESSAGING_PARENT, MESSAGING_KEYS.sendRateLimitMax, String(update.sendMaxPerWindow)),
      );
    }
    if (update.sendWindowSeconds !== undefined) {
      writes.push(
        this.settingsStore.setPlainSetting(
          MESSAGING_PARENT,
          MESSAGING_KEYS.sendRateLimitWindowSeconds,
          String(update.sendWindowSeconds),
        ),
      );
    }
    if (update.contactMaxPerWindow !== undefined) {
      writes.push(
        this.settingsStore.setPlainSetting(
          MESSAGING_PARENT,
          MESSAGING_KEYS.contactRateLimitMax,
          String(update.contactMaxPerWindow),
        ),
      );
    }
    if (update.contactWindowSeconds !== undefined) {
      writes.push(
        this.settingsStore.setPlainSetting(
          MESSAGING_PARENT,
          MESSAGING_KEYS.contactRateLimitWindowSeconds,
          String(update.contactWindowSeconds),
        ),
      );
    }
    await Promise.all(writes);
    return this.resolveMessagingRateLimitPolicy();
  }

  private async resolveMessagingRateLimitPolicy(): Promise<MessagingRateLimitPolicy> {
    const [sendMax, sendWindow, contactMax, contactWindow] = await Promise.all([
      this.settingsStore.getPlainSetting(MESSAGING_PARENT, MESSAGING_KEYS.sendRateLimitMax),
      this.settingsStore.getPlainSetting(MESSAGING_PARENT, MESSAGING_KEYS.sendRateLimitWindowSeconds),
      this.settingsStore.getPlainSetting(MESSAGING_PARENT, MESSAGING_KEYS.contactRateLimitMax),
      this.settingsStore.getPlainSetting(MESSAGING_PARENT, MESSAGING_KEYS.contactRateLimitWindowSeconds),
    ]);

    return {
      sendMaxPerWindow: parsePositiveInt(sendMax, MESSAGING_RATE_LIMIT_DEFAULTS.sendMaxPerWindow),
      sendWindowSeconds: parsePositiveInt(sendWindow, MESSAGING_RATE_LIMIT_DEFAULTS.sendWindowSeconds),
      contactMaxPerWindow: parsePositiveInt(contactMax, MESSAGING_RATE_LIMIT_DEFAULTS.contactMaxPerWindow),
      contactWindowSeconds: parsePositiveInt(contactWindow, MESSAGING_RATE_LIMIT_DEFAULTS.contactWindowSeconds),
    };
  }

  async updateMetricsToggles(update: UpdateMetricsTogglesDto): Promise<MetricsTogglesDto> {
    const subsystems = Object.keys(METRICS_TOGGLE_KEYS) as MetricsSubsystem[];
    const writes = subsystems
      .filter((subsystem) => update[subsystem] !== undefined)
      .map((subsystem) =>
        this.settingsStore.setPlainSetting(
          METRICS_PARENT,
          METRICS_TOGGLE_KEYS[subsystem],
          update[subsystem] === true ? 'true' : 'false',
        ),
      );
    await Promise.all(writes);
    if (this.metricsToggleInvalidator) {
      await this.metricsToggleInvalidator.refresh();
    }
    return this.getMetricsToggles();
  }
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (raw === null || raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function parsePositiveFloat(raw: string | null, fallback: number): number {
  if (raw === null || raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}
