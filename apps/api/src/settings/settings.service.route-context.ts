import { User } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { MessagingRateLimitPolicy, RateLimitPolicy } from './constants';
import { AppSettingsDto } from './dto/app-settings.dto';
import { MetricsTogglesDto } from './dto/metrics-toggles.dto';
import { SystemSettingsDto } from './dto/system-settings.dto';
import { UpdateAppSettingsDto } from './dto/update-app-settings.dto';
import { UpdateSmtpSettingsDto } from './dto/update-smtp-settings.dto';
import { MetricsToggleInvalidator } from './metrics-toggle-invalidator.token';
import { SettingsStoreService } from './settings-store.service';
import { SmtpSettingsService } from './smtp-settings.service';

export function parsePositiveInt(raw: string | null, fallback: number): number {
  if (raw === null || raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

export function parsePositiveFloat(raw: string | null, fallback: number): number {
  if (raw === null || raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

export abstract class SettingsServiceRouteContext {
  protected abstract readonly userRepository: Repository<User>;
  public abstract getAppSettings(): Promise<AppSettingsDto>;
  protected abstract readonly smtpSettingsService: SmtpSettingsService;
  public abstract updateAppSettings(update: UpdateAppSettingsDto): Promise<void>;
  public abstract updateSmtpSettings(update: UpdateSmtpSettingsDto): Promise<void>;
  public abstract getSystemSettings(): Promise<SystemSettingsDto>;
  protected abstract readonly settingsStore: SettingsStoreService;
  protected abstract readonly metricsToggleInvalidator: MetricsToggleInvalidator | null;
  protected abstract resolveRateLimitPolicy(): Promise<RateLimitPolicy>;
  protected abstract resolveMessagingRateLimitPolicy(): Promise<MessagingRateLimitPolicy>;
  public abstract getMetricsToggles(): Promise<MetricsTogglesDto>;
}
