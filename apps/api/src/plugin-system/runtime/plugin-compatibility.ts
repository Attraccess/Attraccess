import * as semver from 'semver';
import type { DatabaseType } from '../../database/backend/database-backend';

/** The first host version whose plugin SDK has no TypeORM surface (SDK 2.0). */
export const MINIMUM_PLUGIN_HOST_VERSION = '2.0.0-0';
export const PLUGIN_MIGRATION_GUIDE_URL = 'https://docs.attraccess.org/#/en/plugins/migrating-to-2';

/** A plugin the host refuses before any database or filesystem mutation. */
export class PluginIncompatibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginIncompatibleError';
  }
}

/** Plugin names come from untrusted manifests: only a short identifier is echoed. */
const safeName = (name: string): string => (/^[\w@./-]{1,100}$/.test(name) ? name : '(unnamed plugin)');

/**
 * Plugins built for SDK 1.x expose TypeORM and host entities and cannot run on this host. They are recognised by a
 * declared minimum host version below 2.0.0-0 (a missing minimum counts as below).
 */
export function assertPluginTargetsSdk2(pluginName: string, minimumHostVersion: string | undefined): void {
  const min = minimumHostVersion ? semver.valid(minimumHostVersion) : null;
  if (min && semver.gte(min, MINIMUM_PLUGIN_HOST_VERSION)) return;
  throw new PluginIncompatibleError(
    `Plugin ${safeName(pluginName)} targets Attraccess ${minimumHostVersion ?? '(no minimum version)'} and the ` +
      `plugin SDK 1.x, which this host no longer supports. Rebuild it for SDK 2.0 and declare ` +
      `attraccessVersion.min >= ${MINIMUM_PLUGIN_HOST_VERSION}. Migration guide: ${PLUGIN_MIGRATION_GUIDE_URL}`,
  );
}

/** The host-range form used by npm packages (`attraccess.host`): its lowest allowed version must be SDK 2.0. */
export function assertHostRangeTargetsSdk2(pluginName: string, hostRange: string): void {
  let lowest: string | undefined;
  try {
    lowest = semver.minVersion(hostRange)?.version;
  } catch {
    lowest = undefined;
  }
  assertPluginTargetsSdk2(pluginName, lowest);
}

/**
 * A plugin that persists data states the engines it supports. Checked before install, startup and plugin
 * migrations, so an incompatible plugin changes nothing.
 */
export function assertPluginSupportsBackend(
  pluginName: string,
  declared: readonly string[] | undefined,
  persists: boolean,
  active: DatabaseType,
): void {
  if (!persists) return;
  if (!declared || declared.length === 0) {
    throw new PluginIncompatibleError(
      `Plugin ${safeName(pluginName)} stores data but declares no persistence.backends in plugin.json. ` +
        `Declare the supported engines, for example ["sqlite"]. Migration guide: ${PLUGIN_MIGRATION_GUIDE_URL}`,
    );
  }
  if (!declared.includes(active)) {
    throw new PluginIncompatibleError(
      `Plugin ${safeName(pluginName)} supports the database engines ${declared.join(', ')} but this host runs ` +
        `${active}. It was not installed or started and no data was changed.`,
    );
  }
}
