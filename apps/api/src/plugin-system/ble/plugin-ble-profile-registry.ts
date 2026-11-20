import {
  bleProfilesEqual,
  normalizeBleProfile,
  PluginBleError,
  type PluginBleProfile,
  type PluginBleProfileDefinition,
} from '@attraccess/plugins-backend-sdk';

/**
 * Profiles per plugin, keyed by the stable manifest id. The store is process-wide on purpose: the bootstrap's
 * throwaway configuration app builds the plugin modules once and the real app builds them again, so the same
 * definitions are registered twice. Identical re-registration is idempotent, which makes both apps agree.
 * Registration needs no host singleton, so plugin load order cannot matter.
 */
const registry = new Map<string, Map<string, PluginBleProfile>>();

export function registerPluginBleProfile(pluginId: string, definition: PluginBleProfileDefinition): PluginBleProfile {
  const profile = normalizeBleProfile(definition);
  const own = registry.get(pluginId) ?? new Map<string, PluginBleProfile>();
  registry.set(pluginId, own);
  const existing = own.get(profile.id);
  if (!existing) {
    own.set(profile.id, profile);
    return profile;
  }
  if (!bleProfilesEqual(existing, profile)) {
    throw new PluginBleError(
      'PROFILE_CONFLICT',
      `Profile "${profile.id}" is already registered with a different definition`,
      {
        detail: profile.id,
      },
    );
  }
  return existing;
}

export function getPluginBleProfile(pluginId: string, profileId: string): PluginBleProfile | undefined {
  return registry.get(pluginId)?.get(profileId);
}

/** The plugin's own profile, or `PROFILE_NOT_REGISTERED` (another plugin's profile looks missing). */
export function requirePluginBleProfile(pluginId: string, profileId: string): PluginBleProfile {
  const profile = getPluginBleProfile(pluginId, profileId);
  if (!profile) {
    throw new PluginBleError('PROFILE_NOT_REGISTERED', `Profile "${profileId}" is not registered by this plugin`, {
      detail: profileId,
    });
  }
  return profile;
}

/** Test helper: forgets every profile. */
export function clearPluginBleProfiles(): void {
  registry.clear();
}
