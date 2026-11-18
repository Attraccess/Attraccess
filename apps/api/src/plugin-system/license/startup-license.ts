import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfigType } from '../../config/app.config';
import { resolveDatabaseBackend } from '../../database/backend';
import { EncryptionService } from '../../encryption/encryption.service';
import { resolveLicenseData } from '../../license/license.service';
import { APP_KEYS, APP_PARENT } from '../../settings/constants';
import type { StandaloneSettingsRows } from '../../settings/settings-rows.port';
import { SettingsStoreService } from '../../settings/settings-store.service';
import { isLicenseGated, type PluginLicenseSnapshot } from './plugin-license';
import { PluginService } from '../plugin.service';

/** Opens the settings on a short-lived connection; null when the database does not exist yet (a fresh install). */
export type OpenStartupSettings = () => Promise<StandaloneSettingsRows | null>;

const openBackendStartupSettings: OpenStartupSettings = () => resolveDatabaseBackend().plugins.openStartupSettings();

/**
 * Opening SQLite can wait on a lock (busy timeout) and verifying the key is CPU work. Either way, startup waits a
 * bounded time only; past it, license-gated plugins stay unloaded.
 */
export const STARTUP_LICENSE_TIMEOUT_MS = 15_000;

/** Trimmed like the seed migration (`1770236486649-seed-settings-from-env`) does before it stores these values. */
function fromEnv(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Determines the license once at startup, before AppModule (and so PluginModule.forRoot()) is imported, because
 * forRoot() decides synchronously which plugins load. The container does not exist yet, so this reads the license key
 * through a short-lived connection the database backend opens (`openSettings`), the way plugin migrations do, and
 * reuses the core license resolution.
 * On a fresh install the database does not exist yet; the seed migration will store `LICENSE_KEY` from the
 * environment, so that is the key this startup uses.
 *
 * Never throws: any failure (unreadable settings, a key that cannot be verified, the timeout) yields `null`, which
 * counts as "no valid license" for license-gated plugins. Ungated plugins are unaffected. Skips all work when no
 * plugin is gated.
 */
export async function evaluateStartupLicense(
  appConfig: AppConfigType,
  logger: Logger,
  timeoutMs = STARTUP_LICENSE_TIMEOUT_MS,
  openSettings: OpenStartupSettings = openBackendStartupSettings,
): Promise<PluginLicenseSnapshot> {
  if (!PluginService.getPlugins().some((manifest) => isLicenseGated(manifest.license))) return null;

  let timer: NodeJS.Timeout | undefined;
  let settings: StandaloneSettingsRows | undefined;
  let settled = false;
  const work = resolveStartupLicense(appConfig, logger, openSettings, (opened) => (settings = opened)).finally(() => {
    settled = true;
  });
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Timed out waiting for the license check')), timeoutMs);
  });
  const close = async () => {
    try {
      await settings?.close();
    } catch (error) {
      logger.warn(`Could not close the startup license connection: ${String(error)}`);
    }
  };
  try {
    const data = await Promise.race([work, timeout]);
    return { valid: data.valid, modules: data.valid ? data.modules : [] };
  } catch (error) {
    logger.warn(`Could not determine the license at startup; license-gated plugins stay unloaded: ${String(error)}`);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
    // After a timeout the check may still open the connection; close it once the check is done.
    if (settled) await close();
    else void work.catch(() => undefined).then(close);
  }
}

async function resolveStartupLicense(
  appConfig: AppConfigType,
  logger: Logger,
  openSettings: OpenStartupSettings,
  onOpened: (settings: StandaloneSettingsRows) => void,
) {
  const rows = await openSettings();
  // A fresh install has no database yet; the backend does not create an empty one for it here.
  if (!rows) {
    return resolveLicenseData(
      fromEnv(process.env.LICENSE_KEY),
      async () => fromEnv(process.env.ATTRACCESS_URL ?? process.env.VITE_ATTRACCESS_URL),
      appConfig.LICENSO_PUBLIC_KEY,
      logger,
    );
  }

  onOpened(rows);
  const settings = new SettingsStoreService(rows, new EncryptionService(new ConfigService({ app: appConfig })));
  const licenseKey = (await settings.getSecretSetting(APP_PARENT, APP_KEYS.licenseKey)).value;
  return resolveLicenseData(
    licenseKey,
    () => settings.getPlainSetting(APP_PARENT, APP_KEYS.url),
    appConfig.LICENSO_PUBLIC_KEY,
    logger,
  );
}
