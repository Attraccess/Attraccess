/**
 * The built-in groups of the "Add widget" gallery, in their order. Plugin groups follow, in plugin load order.
 * Titles: widgets/en.json `groups.<id>`.
 */
export const BUILT_IN_GALLERY_GROUP_IDS = ['messages', 'resources', 'users', 'billing', 'attractap', 'other'] as const;

export type BuiltInGalleryGroupId = (typeof BUILT_IN_GALLERY_GROUP_IDS)[number];

/**
 * The gallery group of each built-in sidebar page, by its sidebar translation key, else that of its sidebar group.
 * Pages missing here are "Other pages".
 */
export const GALLERY_GROUP_BY_SIDEBAR_KEY: Readonly<Record<string, BuiltInGalleryGroupId>> = {
  messages: 'messages',
  resources: 'resources',
  projects: 'resources',
  csvExport: 'resources',
  users: 'users',
  billing: 'billing',
  attractap: 'attractap',
  attractapReaders: 'attractap',
};

export const pluginGalleryGroupId = (manifestName: string) => `plugin:${manifestName}`;

/** A plugin's group title when none of its widgets names one: its manifest name, e.g. "room-booking" → "Room booking". */
export function pluginGroupTitle(manifestName: string): string {
  const words = manifestName.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
