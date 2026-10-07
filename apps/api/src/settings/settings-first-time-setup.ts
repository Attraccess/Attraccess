import { APP_KEYS, APP_PARENT } from './constants';
import { AppSettingsDto } from './dto/app-settings.dto';
import { FirstTimeSetupStatusDto, FirstTimeSetupStepsDto } from './dto/first-time-setup-status.dto';
import { SmtpServiceType } from './dto/smtp-settings.dto';
import { SystemSettingsDto } from './dto/system-settings.dto';
import { UpdateAppSettingsDto } from './dto/update-app-settings.dto';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { SettingsMetricsPolicyImplementation } from './settings-metrics-policy';
export abstract class SettingsFirstTimeSetupImplementation extends SettingsMetricsPolicyImplementation {
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
      app: !!app.url?.trim() && app.licenseKeyConfigured === true,
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
      await this.settingsStore.setPlainSetting(
        APP_PARENT,
        APP_KEYS.publicInternetUrl,
        update.publicInternetUrl ?? null,
      );
    }
    if (Object.prototype.hasOwnProperty.call(update, 'licenseKey')) {
      await this.settingsStore.setSecretSetting(APP_PARENT, APP_KEYS.licenseKey, update.licenseKey ?? null);
    }
  }
}
