import { Logger, NotFoundException } from '@nestjs/common';
import { ResourceHealthSource, ResourceHealthStatus, type ResourceHealthRecord } from '@attraccess/application-models';
import {
  PLUGIN_RESOURCE_HEALTH_KEY_PATTERN,
  PLUGIN_RESOURCE_HEALTH_MAX_REASON_LENGTH,
  type PluginResourceHealthContext,
} from '@attraccess/plugins-backend-sdk';
import { SYSTEM_AUDIT_ACTOR } from '../../audit/recorder/audit-event';
import type { ResourceHealthService } from '../../resources/health/resource-health.service';

const logger = new Logger('PluginResourceHealth');

export type PluginResourceHealthHost = Pick<
  ResourceHealthService,
  'reportHealth' | 'clearEntry' | 'listForResource' | 'listBySourceAndPrefix' | 'resourceExists'
>;

/** The identifier prefix of every entry of one plugin. */
const pluginHealthPrefix = (pluginName: string): string => `plugin:${pluginName}:`;

function keyOf(key: unknown): string {
  if (typeof key !== 'string' || !PLUGIN_RESOURCE_HEALTH_KEY_PATTERN.test(key)) {
    throw new Error(
      `Health key ${JSON.stringify(key)} is invalid: use 1 to 64 characters of a-z, 0-9, ".", "_" and "-".`,
    );
  }
  return key;
}

/**
 * The plugin's own entry: source `plugin`, its prefix, and a valid key after it. The key check keeps plugin `a` off
 * the entries of a plugin named `a:b` (`plugin:a:b:<key>`), since keys never hold a colon.
 */
const isOwn = (entry: ResourceHealthRecord, prefix: string): boolean =>
  entry.source === ResourceHealthSource.PLUGIN &&
  entry.identifier.startsWith(prefix) &&
  PLUGIN_RESOURCE_HEALTH_KEY_PATTERN.test(entry.identifier.slice(prefix.length));

async function removeEntry(health: PluginResourceHealthHost, entry: ResourceHealthRecord): Promise<void> {
  try {
    // The audit log has no plugin actor: the entry's identifier and source `plugin` name the plugin.
    await health.clearEntry(entry.resourceId, entry.id, SYSTEM_AUDIT_ACTOR);
  } catch (error) {
    // Removed concurrently (an admin cleared it): nothing is left to do.
    if (!(error instanceof NotFoundException)) throw error;
  }
}

/**
 * `context.resourceHealth` of one plugin. Every entry is stored under `plugin:<pluginName>:<key>` with the source
 * `plugin`; an entry of another source or prefix is never read, written or removed, even when its identifier is
 * the one the plugin names.
 */
export function createPluginResourceHealthContext(
  pluginName: string,
  getHealth: () => PluginResourceHealthHost,
): PluginResourceHealthContext {
  const prefix = pluginHealthPrefix(pluginName);
  const ownEntry = async (health: PluginResourceHealthHost, resourceId: number, identifier: string) =>
    (await health.listForResource(resourceId)).find((entry) => entry.identifier === identifier);

  return {
    async report(input) {
      const key = keyOf(input.key);
      const health = getHealth();
      if (!(await health.resourceExists(input.resourceId))) return;
      const identifier = `${prefix}${key}`;
      const existing = await ownEntry(health, input.resourceId, identifier);
      if (existing && !isOwn(existing, prefix)) {
        logger.warn(
          `Plugin ${pluginName} cannot report "${identifier}" on resource ${input.resourceId}: it is not its entry.`,
        );
        return;
      }
      const unhealthy = input.status === 'unhealthy';
      const reason = unhealthy ? (input.reason ?? '').trim().slice(0, PLUGIN_RESOURCE_HEALTH_MAX_REASON_LENGTH) : null;
      try {
        await health.reportHealth({
          resourceId: input.resourceId,
          identifier,
          status: unhealthy ? ResourceHealthStatus.UNHEALTHY : ResourceHealthStatus.HEALTHY,
          reason,
          source: ResourceHealthSource.PLUGIN,
          auditOrigin: SYSTEM_AUDIT_ACTOR,
        });
      } catch (error) {
        // Deleted since the check above (the entry's foreign key fails): skipped like an unknown resource.
        if (await health.resourceExists(input.resourceId)) throw error;
      }
    },

    async clear(resourceId, key) {
      const identifier = `${prefix}${keyOf(key)}`;
      const health = getHealth();
      const entry = await ownEntry(health, resourceId, identifier);
      if (entry && isOwn(entry, prefix)) await removeEntry(health, entry);
    },

    async list(resourceId) {
      const entries = await getHealth().listBySourceAndPrefix(ResourceHealthSource.PLUGIN, prefix, resourceId);
      return entries
        .filter((entry) => isOwn(entry, prefix))
        .map((entry) => ({
          resourceId: entry.resourceId,
          key: entry.identifier.slice(prefix.length),
          status: entry.status,
          reason: entry.reason,
          lastReportedAt: entry.lastReportedAt,
        }));
    },
  };
}

/**
 * Removes every health entry of a plugin, through the clear path, so doors stay not blocked and recoveries are
 * notified. Used when the plugin is uninstalled. Returns the number of entries removed.
 */
export async function clearAllPluginResourceHealth(
  pluginName: string,
  health: PluginResourceHealthHost,
): Promise<number> {
  const prefix = pluginHealthPrefix(pluginName);
  const entries = (await health.listBySourceAndPrefix(ResourceHealthSource.PLUGIN, prefix)).filter((entry) =>
    isOwn(entry, prefix),
  );
  for (const entry of entries) await removeEntry(health, entry);
  return entries.length;
}
