import type { PluginLocalizedLabel, PluginNotificationCategory } from '@attraccess/plugins-backend-sdk';

export type PluginNotificationCategoryKey = `plugin.${string}`;

export interface RegisteredPluginNotificationCategory {
  /** Namespaced key, `plugin.<pluginName>.<id>`; also the key stored in user preferences. */
  key: PluginNotificationCategoryKey;
  pluginName: string;
  id: string;
  label: PluginLocalizedLabel;
}

const CATEGORY_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

const registry = new Map<string, RegisteredPluginNotificationCategory>();

export function pluginNotificationCategoryKey(pluginName: string, id: string): PluginNotificationCategoryKey {
  return `plugin.${pluginName}.${id}`;
}

/**
 * Registers the categories one plugin declares. Replaces any earlier registration of the same plugin so
 * a reload never accumulates stale entries. Throws on a malformed declaration (quarantines the plugin).
 */
export function registerPluginNotificationCategories(
  pluginName: string,
  categories: readonly PluginNotificationCategory[],
): void {
  const seen = new Set<string>();
  for (const category of categories) {
    if (typeof category?.id !== 'string' || !CATEGORY_ID_PATTERN.test(category.id)) {
      throw new Error(
        `Plugin "${pluginName}" declares an invalid notification category id "${String(category?.id)}". ` +
          'Use lowercase letters, digits, "-" and "_".',
      );
    }
    if (typeof category.label?.en !== 'string' || typeof category.label?.de !== 'string') {
      throw new Error(`Plugin "${pluginName}" notification category "${category.id}" needs label.en and label.de.`);
    }
    if (seen.has(category.id)) {
      throw new Error(`Plugin "${pluginName}" declares notification category "${category.id}" twice.`);
    }
    seen.add(category.id);
  }

  unregisterPluginNotificationCategories(pluginName);
  for (const category of categories) {
    const key = pluginNotificationCategoryKey(pluginName, category.id);
    registry.set(key, { key, pluginName, id: category.id, label: { en: category.label.en, de: category.label.de } });
  }
}

export function unregisterPluginNotificationCategories(pluginName: string): void {
  for (const [key, entry] of registry) {
    if (entry.pluginName === pluginName) registry.delete(key);
  }
}

export function getPluginNotificationCategory(key: string): RegisteredPluginNotificationCategory | undefined {
  return registry.get(key);
}

export function listPluginNotificationCategories(): RegisteredPluginNotificationCategory[] {
  return [...registry.values()];
}
