import { Setting } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'fs';
import { DataSourceOptions } from 'typeorm';
import { AppConfigType } from '../../config/app.config';
import { dataSourceConfig } from '../../database/datasource';
import { createDataSource } from '../../database/sqlite-connection';
import { EncryptionService } from '../../encryption/encryption.service';
import { resolveLicenseData } from '../../license/license.service';
import { APP_KEYS, APP_PARENT } from '../../settings/constants';
import { SettingsStoreService } from '../../settings/settings-store.service';
import { isLicenseGated, type PluginLicenseSnapshot } from './plugin-license';
import { PluginService } from '../plugin.service';

/** Licenso is a network call; an outage must delay startup by a bounded time only. */
export const STARTUP_LICENSE_TIMEOUT_MS = 15_000;

/**
 * Determines the license once at startup, before AppModule (and so PluginModule.forRoot()) is imported, because
 * forRoot() decides synchronously which plugins load. The container does not exist yet, so this reads the license key
 * through a short-lived standalone connection, the way plugin migrations do, and reuses the core license resolution.
 *
 * Never throws: any failure (no database yet, unreadable settings, Licenso error) yields `null`, which counts as "no
 * valid license" for license-gated plugins. Ungated plugins are unaffected. Skips all work when no plugin is gated.
 */
export async function evaluateStartupLicense(appConfig: AppConfigType, logger: Logger): Promise<PluginLicenseSnapshot> {
  if (!PluginService.getPlugins().some((manifest) => isLicenseGated(manifest.license))) return null;

  const database = (dataSourceConfig as { database?: unknown }).database;
  // A fresh install has no database (and so no license key) yet. Do not create an empty file for it here.
  if (typeof database !== 'string' || !existsSync(database)) return null;

  const dataSource = createDataSource({
    ...dataSourceConfig,
    entities: [Setting],
    migrations: [],
    migrationsRun: false,
    synchronize: false,
  } as DataSourceOptions);

  let timer: NodeJS.Timeout | undefined;
  try {
    await dataSource.initialize();
    const settings = new SettingsStoreService(
      dataSource.getRepository(Setting),
      new EncryptionService(new ConfigService({ app: appConfig })),
    );
    const licenseKey = (await settings.getSecretSetting(APP_PARENT, APP_KEYS.licenseKey)).value;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Timed out waiting for the license check')),
        STARTUP_LICENSE_TIMEOUT_MS,
      );
    });
    const data = await Promise.race([
      resolveLicenseData(
        licenseKey,
        () => settings.getPlainSetting(APP_PARENT, APP_KEYS.url),
        appConfig.LICENSO_PUBLIC_KEY,
        logger,
      ),
      timeout,
    ]);
    return { valid: data.valid, modules: data.modules };
  } catch (error) {
    logger.warn(`Could not determine the license at startup; license-gated plugins stay unloaded: ${String(error)}`);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
    try {
      if (dataSource.isInitialized) await dataSource.destroy();
    } catch (error) {
      logger.warn(`Could not close the startup license connection: ${String(error)}`);
    }
  }
}
