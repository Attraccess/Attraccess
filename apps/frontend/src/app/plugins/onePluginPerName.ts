import type { LoadedPluginManifest } from '@attraccess/react-query-client';

/**
 * One manifest per plugin name, preferring one that did not fail. The host lists refused copies (for example an old
 * 1.x upload next to its 2.x build) so they can be removed; such a copy must not take the name from the working one.
 */
export function onePluginPerName(manifests: LoadedPluginManifest[]): LoadedPluginManifest[] {
  const byName = new Map<string, LoadedPluginManifest>();
  for (const manifest of manifests) {
    const current = byName.get(manifest.name);
    if (!current || (current.status === 'error' && manifest.status !== 'error')) byName.set(manifest.name, manifest);
  }
  return [...byName.values()];
}
