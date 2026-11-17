/** The license of the Attraccess installation, as the host sees it right now. */
export interface PluginLicenseInfo {
  /** Whether the license is valid. `false` also when no key is configured or the license could not be checked. */
  valid: boolean;
  /** Why the license is not valid. */
  reason?: string;
  /** Modules the license grants. The non-profit key grants core modules only, never plugin modules. */
  modules: string[];
  /** Usage limits by name (e.g. `users`, `resources`). A missing entry means no limit. */
  usageLimits: Record<string, number>;
  /** The installation uses the free non-profit key. */
  isNonProfit: boolean;
}

export interface PluginLicenseRequirements {
  /** License modules that must all be granted. */
  modules?: string[];
  /** Current usage by limit name; `verify` fails when a count has reached its limit. */
  usageLimits?: Record<string, number>;
}

/** Thrown by {@link PluginLicenseContext.verify} when the license does not satisfy the requirements. */
export class PluginLicenseError extends Error {
  constructor(public readonly reason: string) {
    super(`PLUGIN_LICENSE_ERROR: ${reason}`);
    this.name = 'PluginLicenseError';
  }
}

/**
 * Lets a plugin ask the host about the license, so it can decide itself how much it offers. Backed by the same
 * logic as the core's license checks. It needs no permission. Every call checks the license anew.
 *
 * What a plugin cannot work without belongs in the manifest (`license` in plugin.json): the host then does not load
 * the plugin at all. Use this API for everything that should degrade gracefully instead.
 */
export interface PluginLicenseContext {
  /** Never throws: when the license cannot be determined, `valid` is false and `reason` says why. */
  getLicense(): Promise<PluginLicenseInfo>;

  /** True only when the license is valid and grants the module. False when it cannot be determined. */
  hasModule(module: string): Promise<boolean>;

  /** Resolves when the license is valid and satisfies the requirements, otherwise throws {@link PluginLicenseError}. */
  verify(requirements?: PluginLicenseRequirements): Promise<void>;
}
