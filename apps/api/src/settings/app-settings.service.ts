import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfigType } from '../config/app.config';
import { AppSettingsDto } from './dto/app-settings.dto';
import { UpdateAppSettingsDto } from './dto/update-app-settings.dto';
import { APP_KEYS, APP_PARENT } from './constants';
import { SettingsStoreService } from './settings-store.service';

@Injectable()
export class AppSettingsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly settingsStore: SettingsStoreService,
  ) {}

  async getSettings(): Promise<AppSettingsDto> {
    const appConfig = this.configService.get<AppConfigType>('app');
    const [frontendUrl, backendUrl, publicInternetUrl, licenseKey] = await Promise.all([
      this.settingsStore.getPlainSetting(
        APP_PARENT,
        APP_KEYS.frontendUrl,
        this.resolveFrontendUrl(appConfig),
        true,
      ),
      this.settingsStore.getPlainSetting(APP_PARENT, APP_KEYS.backendUrl, this.resolveBackendUrl(appConfig), true),
      this.settingsStore.getPlainSetting(
        APP_PARENT,
        APP_KEYS.publicInternetUrl,
        this.resolvePublicInternetUrl(appConfig),
        true,
      ),
      this.settingsStore.getSecretSetting(APP_PARENT, APP_KEYS.licenseKey, this.resolveLicenseKey(appConfig), true),
    ]);

    return {
      frontendUrl,
      backendUrl,
      publicInternetUrl,
      licenseKeyConfigured: licenseKey.configured,
    };
  }

  async updateSettings(update: UpdateAppSettingsDto): Promise<void> {
    if (Object.prototype.hasOwnProperty.call(update, 'frontendUrl')) {
      await this.settingsStore.setPlainSetting(APP_PARENT, APP_KEYS.frontendUrl, update.frontendUrl ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(update, 'backendUrl')) {
      await this.settingsStore.setPlainSetting(APP_PARENT, APP_KEYS.backendUrl, update.backendUrl ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(update, 'publicInternetUrl')) {
      await this.settingsStore.setPlainSetting(APP_PARENT, APP_KEYS.publicInternetUrl, update.publicInternetUrl ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(update, 'licenseKey')) {
      await this.settingsStore.setSecretSetting(APP_PARENT, APP_KEYS.licenseKey, update.licenseKey ?? null);
    }
  }

  async getFrontendUrl(): Promise<string | null> {
    const appConfig = this.configService.get<AppConfigType>('app');
    return this.settingsStore.getPlainSetting(APP_PARENT, APP_KEYS.frontendUrl, this.resolveFrontendUrl(appConfig), true);
  }

  async getBackendUrl(): Promise<string | null> {
    const appConfig = this.configService.get<AppConfigType>('app');
    return this.settingsStore.getPlainSetting(APP_PARENT, APP_KEYS.backendUrl, this.resolveBackendUrl(appConfig), true);
  }

  async getPublicInternetUrl(): Promise<string | null> {
    const appConfig = this.configService.get<AppConfigType>('app');
    return this.settingsStore.getPlainSetting(
      APP_PARENT,
      APP_KEYS.publicInternetUrl,
      this.resolvePublicInternetUrl(appConfig),
      true,
    );
  }

  async getLicenseKey(): Promise<string | null> {
    const appConfig = this.configService.get<AppConfigType>('app');
    const licenseKey = await this.settingsStore.getSecretSetting(
      APP_PARENT,
      APP_KEYS.licenseKey,
      this.resolveLicenseKey(appConfig),
      true,
    );
    return licenseKey.value;
  }

  private resolveFrontendUrl(appConfig?: AppConfigType): string | null {
    return (
      appConfig?.ATTRACCESS_FRONTEND_URL ??
      process.env.ATTRACCESS_FRONTEND_URL ??
      process.env.FRONTEND_URL ??
      process.env.ATTRACCESS_URL ??
      process.env.VITE_ATTRACCESS_URL ??
      null
    );
  }

  private resolveBackendUrl(appConfig?: AppConfigType): string | null {
    return appConfig?.ATTRACCESS_URL ?? process.env.ATTRACCESS_URL ?? process.env.VITE_ATTRACCESS_URL ?? null;
  }

  private resolvePublicInternetUrl(appConfig?: AppConfigType): string | null {
    return (
      appConfig?.ATTRACCESS_PUBLIC_INTERNET_URL ??
      process.env.ATTRACCESS_PUBLIC_INTERNET_URL ??
      this.resolveBackendUrl(appConfig)
    );
  }

  private resolveLicenseKey(appConfig?: AppConfigType): string | null {
    return appConfig?.LICENSE_KEY ?? process.env.LICENSE_KEY ?? null;
  }
}
