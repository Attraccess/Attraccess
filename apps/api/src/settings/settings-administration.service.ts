import { Inject, Injectable } from '@nestjs/common';

import {
  auditSubjectKeyId,
  PreviousAuditSettings,
  SETTING_KEYS,
  safeAuditHost,
  safeAuditOrigin,
  safeAuditSender,
} from '../audit/policies/administration';

import { AUDIT_RECORDER, AuditActor, AuditRecorder } from '../audit/recorder/audit-event';

import { AuditSettingsDto } from './dto/audit-settings.dto';

import { AuthRateLimitSettingsDto } from './dto/auth-rate-limit-settings.dto';

import { GenerateMetricsApiKeyResponseDto } from './dto/generate-metrics-api-key-response.dto';

import { MessagingRateLimitSettingsDto } from './dto/messaging-rate-limit-settings.dto';

import { MetricsSettingsDto } from './dto/metrics-settings.dto';

import { ResourceVisibilitySettingsDto } from './dto/resource-visibility-settings.dto';

import { SystemSettingsDto } from './dto/system-settings.dto';

import { UpdateAuthRateLimitSettingsDto } from './dto/update-auth-rate-limit-settings.dto';

import { UpdateMessagingRateLimitSettingsDto } from './dto/update-messaging-rate-limit-settings.dto';

import { UpdateMetricsSettingsDto } from './dto/update-metrics-settings.dto';

import { UpdateResourceVisibilitySettingsDto } from './dto/update-resource-visibility-settings.dto';

import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';

import { SettingsService } from './settings.service';

export function systemSettingChanges(
  before: SystemSettingsDto,
  after: SystemSettingsDto,
): Array<[string, string, string]> {
  const values = [
    ['app.url', safeAuditOrigin(before.app.url ?? ''), safeAuditOrigin(after.app.url ?? '')],
    [
      'app.publicInternetUrl',
      safeAuditOrigin(before.app.publicInternetUrl ?? ''),
      safeAuditOrigin(after.app.publicInternetUrl ?? ''),
    ],
    ['app.licenseKeyConfigured', before.app.licenseKeyConfigured, after.app.licenseKeyConfigured],
    ['app.defaultLanguage', before.app.defaultLanguage, after.app.defaultLanguage],
    ['smtp.service', before.smtp.service, after.smtp.service],
    ['smtp.host', safeAuditHost(before.smtp.host ?? ''), safeAuditHost(after.smtp.host ?? '')],
    ['smtp.port', before.smtp.port, after.smtp.port],
    ['smtp.secure', before.smtp.secure, after.smtp.secure],
    ['smtp.from', safeAuditSender(before.smtp.from ?? ''), safeAuditSender(after.smtp.from ?? '')],
    ['smtp.userConfigured', !!before.smtp.user, !!after.smtp.user],
    ['smtp.passConfigured', before.smtp.passConfigured, after.smtp.passConfigured],
  ] as const;
  return values
    .filter(
      ([key, oldValue, newValue]) =>
        oldValue !== newValue ||
        (key === 'app.url' && before.app.url !== after.app.url) ||
        (key === 'app.publicInternetUrl' && before.app.publicInternetUrl !== after.app.publicInternetUrl),
    )
    .map(([key, oldValue, newValue]) => [key, String(oldValue ?? ''), String(newValue ?? '')]);
}

/**
 * Setting changes made by an administrator: each changed value is audited as `settings.updated` with its
 * sanitized old and new value. First-time setup writes through SettingsService and is not audited.
 */
@Injectable()
export class SettingsAdministrationService {
  constructor(
    private readonly settingsService: SettingsService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async updateAuditSettings(body: unknown, actor: AuditActor): Promise<AuditSettingsDto> {
    const before = await this.settingsService.getAuditSettings();
    const after = await this.settingsService.updateAuditSettings(body);
    // The previous settings decide whether the change that turns recording off is itself recorded.
    await this.recordChanges(actor, 'audit', before, after, before);
    return after;
  }

  async updateSystemSettings(body: UpdateSystemSettingsDto, actor: AuditActor): Promise<SystemSettingsDto> {
    const before = await this.settingsService.getSystemSettings();
    const after = await this.settingsService.updateSystemSettings(body);
    for (const [key, oldValue, newValue] of systemSettingChanges(before, after)) {
      await this.recordSetting(actor, key, oldValue, newValue);
    }
    if (before.smtp.user !== after.smtp.user) await this.recordSetting(actor, 'smtp.userChanged', 'false', 'true');
    // Record credential rotation without retaining either credential value.
    if (body.app?.licenseKey !== undefined) await this.recordSetting(actor, 'app.licenseKeyChanged', 'false', 'true');
    if (body.smtp?.pass !== undefined) await this.recordSetting(actor, 'smtp.passwordChanged', 'false', 'true');
    return after;
  }

  async metricsSettings(): Promise<MetricsSettingsDto> {
    const [{ configured }, toggles, slowQueryThresholdSeconds] = await Promise.all([
      this.settingsService.getMetricsApiKey(),
      this.settingsService.getMetricsToggles(),
      this.settingsService.getMetricsSlowQueryThresholdSeconds(),
    ]);
    return { apiKeyConfigured: configured, toggles, slowQueryThresholdSeconds };
  }

  async updateMetricsSettings(body: UpdateMetricsSettingsDto, actor: AuditActor): Promise<MetricsSettingsDto> {
    const before = await this.metricsSettings();
    if (body.toggles) {
      await this.settingsService.updateMetricsToggles(body.toggles);
    }
    if (body.slowQueryThresholdSeconds !== undefined) {
      await this.settingsService.setMetricsSlowQueryThresholdSeconds(body.slowQueryThresholdSeconds);
    }
    const after = await this.metricsSettings();
    await this.recordChanges(actor, 'metrics', before, after);
    await this.recordChanges(actor, 'metrics.toggles', before.toggles, after.toggles);
    return after;
  }

  async generateMetricsApiKey(actor: AuditActor): Promise<GenerateMetricsApiKeyResponseDto> {
    const { apiKey } = await this.settingsService.generateMetricsApiKey();
    await this.recordKey(actor, 'settings.api_key.generated', 1);
    return { apiKeyConfigured: true, apiKey };
  }

  async deleteMetricsApiKey(actor: AuditActor): Promise<MetricsSettingsDto> {
    await this.settingsService.setMetricsApiKey(null);
    await this.recordKey(actor, 'settings.api_key.deleted', 0);
    return this.metricsSettings();
  }

  async updateAuthRateLimitSettings(
    body: UpdateAuthRateLimitSettingsDto,
    actor: AuditActor,
  ): Promise<AuthRateLimitSettingsDto> {
    const before = await this.settingsService.getAuthRateLimitSettings();
    const after = await this.settingsService.updateAuthRateLimitSettings(body);
    await this.recordChanges(actor, 'auth.rateLimit', before, after);
    return after;
  }

  async updateMessagingRateLimitSettings(
    body: UpdateMessagingRateLimitSettingsDto,
    actor: AuditActor,
  ): Promise<MessagingRateLimitSettingsDto> {
    const before = await this.settingsService.getMessagingRateLimitSettings();
    const after = await this.settingsService.updateMessagingRateLimitSettings(body);
    await this.recordChanges(actor, 'messaging.rateLimit', before, after);
    return after;
  }

  async updateResourceVisibilitySettings(
    body: UpdateResourceVisibilitySettingsDto,
    actor: AuditActor,
  ): Promise<ResourceVisibilitySettingsDto> {
    const before = await this.settingsService.getResourceVisibilitySettings();
    const after = await this.settingsService.updateResourceVisibilitySettings(body);
    await this.recordChanges(actor, 'resources', before, after);
    return after;
  }

  /** Records each audited key below `prefix` whose value differs between the two snapshots. */
  private async recordChanges(
    actor: AuditActor,
    prefix: string,
    before: object,
    after: object,
    previousAuditSettings?: PreviousAuditSettings,
  ) {
    for (const key of SETTING_KEYS.filter((key) => key.startsWith(`${prefix}.`))) {
      const field = key.slice(prefix.length + 1);
      if (field.includes('.')) continue;
      const oldValue = Object.getOwnPropertyDescriptor(before, field)?.value;
      const newValue = Object.getOwnPropertyDescriptor(after, field)?.value;
      if (oldValue === undefined || newValue === undefined) continue;
      const oldText = Array.isArray(oldValue) ? oldValue.join(',') : String(oldValue);
      const newText = Array.isArray(newValue) ? newValue.join(',') : String(newValue);
      if (oldText !== newText) await this.recordSetting(actor, key, oldText, newText, previousAuditSettings);
    }
  }

  private async recordSetting(
    actor: AuditActor,
    key: string,
    before: string,
    after: string,
    previousAuditSettings?: PreviousAuditSettings,
  ) {
    await this.audit.record(
      {
        domain: 'administration',
        action: 'settings.updated',
        actor,
        subject: { type: 'setting', id: auditSubjectKeyId(key) },
        details: { settingKey: key, before, after },
      },
      undefined,
      { previousAuditSettings },
    );
  }

  private async recordKey(
    actor: AuditActor,
    action: 'settings.api_key.generated' | 'settings.api_key.deleted',
    configured: number,
  ) {
    await this.audit.record({
      domain: 'administration',
      action,
      actor,
      subject: { type: 'setting', id: auditSubjectKeyId('metrics.apiKeyConfigured') },
      details: { settingKey: 'metrics.apiKeyConfigured', configured },
    });
  }
}
