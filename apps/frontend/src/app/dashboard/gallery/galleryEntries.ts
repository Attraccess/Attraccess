import { DashboardPinItem } from '../pins';
import { TileSizes } from '../sizes';
import { BUILT_IN_GALLERY_GROUP_IDS, pluginGroupTitle } from '../widgets/groups';
import { GalleryGroup } from '../widgets/widgetsContext';

export type GalleryEntryKind = 'widget' | 'page' | 'resource';

/** One tile of the "Add widget" gallery: a widget, a page shortcut, or the entry that pins a chosen resource. */
export interface GalleryEntry extends TileSizes {
  key: string;
  kind: GalleryEntryKind;
  title: string;
  description?: string;
  groupId: string;
  keywords?: string[];
  /** What Add pins. The resource entry has none: the user chooses the resource first. */
  item?: DashboardPinItem;
}

export interface GalleryGroupWithEntries extends GalleryGroup {
  entries: GalleryEntry[];
}

/** Lowercase, without diacritics, so "uber" finds "Über" and "Ubersicht" finds "Übersicht". */
export function normalizeSearchText(text: string, language: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase(language);
}

/** Whether an entry matches the term by title, description, group title or keywords. An empty term matches all. */
export function matchesSearch(entry: GalleryEntry, groupTitle: string, term: string, language: string): boolean {
  const needle = normalizeSearchText(term.trim(), language);
  if (!needle) return true;
  return [entry.title, entry.description, groupTitle, ...(entry.keywords ?? [])].some(
    (text) => !!text && normalizeSearchText(text, language).includes(needle),
  );
}

/**
 * Sorts entries into their groups: the built-in groups first in their fixed order, then one group per plugin in
 * plugin load order, then any group a widget named itself. Groups without entries are left out.
 */
export function groupGalleryEntries({
  entries,
  builtInTitles,
  knownGroups,
  pluginNames,
}: {
  entries: GalleryEntry[];
  builtInTitles: (id: string) => string;
  /** Titles of groups the widgets name, e.g. a plugin's own group title. */
  knownGroups: GalleryGroup[];
  /** Manifest names of the loaded plugins, in load order. */
  pluginNames: string[];
}): GalleryGroupWithEntries[] {
  const titles = new Map<string, string>(BUILT_IN_GALLERY_GROUP_IDS.map((id) => [id, builtInTitles(id)]));
  pluginNames.forEach((name) => titles.set(`plugin:${name}`, pluginGroupTitle(name)));
  knownGroups.forEach((group) => titles.set(group.id, group.title));

  const order = [...titles.keys(), ...entries.map((entry) => entry.groupId).filter((id) => !titles.has(id))];
  return [...new Set(order)]
    .map((id) => ({
      id,
      title: titles.get(id) ?? id,
      entries: entries.filter((entry) => entry.groupId === id),
    }))
    .filter((group) => group.entries.length > 0);
}
