/**
 * The plugin's own health entries on resources (permission `REPORT_RESOURCE_HEALTH`).
 *
 * A resource is unhealthy while any of its health entries is unhealthy. A plugin owns the entries it writes: the host
 * stores each one under the identifier `plugin:<pluginName>:<key>` with the source `plugin`, so a plugin can never read,
 * change or clear a manual entry, a flow entry or the entry of another plugin.
 *
 * An unhealthy resource blocks usage for everyone without maintenance permission. Report unhealthy only for a state
 * you are sure of, and clear the entry when the state is gone.
 */

/** Keys are 1 to 64 characters of `a-z`, `0-9`, `.`, `_` and `-`, starting with a letter or digit. */
export const PLUGIN_RESOURCE_HEALTH_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** Longest reason the host keeps; a longer one is cut. */
export const PLUGIN_RESOURCE_HEALTH_MAX_REASON_LENGTH = 500;

export interface PluginResourceHealthReport {
  resourceId: number;
  /** Names the plugin's entry on the resource; see {@link PLUGIN_RESOURCE_HEALTH_KEY_PATTERN}. */
  key: string;
  status: 'healthy' | 'unhealthy';
  /** Plain words shown to maintainers. Trimmed and cut to 500 characters; dropped for `healthy`. */
  reason?: string | null;
}

export interface PluginResourceHealthEntry {
  resourceId: number;
  key: string;
  status: 'healthy' | 'unhealthy';
  reason: string | null;
  lastReportedAt: Date;
}

export interface PluginResourceHealthContext {
  /**
   * Creates or updates the plugin's entry. Reporting the status the entry already has changes nothing and notifies
   * nobody; a change of status notifies like a manual change does. An unknown resource is skipped. An invalid key throws.
   */
  report(input: PluginResourceHealthReport): Promise<void>;

  /**
   * Removes the plugin's entry. An unhealthy entry counts as recovered: the host notifies as it does when a manual
   * entry is cleared. Does nothing when there is no entry or no such resource. An invalid key throws.
   */
  clear(resourceId: number, key: string): Promise<void>;

  /** The plugin's own entries, of one resource or of all resources. Use it to reconcile after a restart. */
  list(resourceId?: number): Promise<PluginResourceHealthEntry[]>;
}
