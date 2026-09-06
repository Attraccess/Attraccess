import { describe, expect, it } from 'vitest';
import { buildSidebarEndItems, SIDEBAR_ITEMS } from './sidebarItems';
import de from './sidebar.de.json';
import en from './sidebar.en.json';

// Both trees render in the same sidebar at the same time, so collisions are only meaningful
// across their union. The end tree's URLs are stubbed; nothing here depends on their contents.
const ALL_ITEMS = [
  ...SIDEBAR_ITEMS,
  ...buildSidebarEndItems('https://github.com/stub/bug', 'https://github.com/stub/feature'),
];

// `isGroup` discriminates the union, so this narrows to SidebarItem[] without a cast.
const navigableItems = ALL_ITEMS.flatMap((item) => ('items' in item ? item.items : [item]));

describe('sidebar items', () => {
  it('gives every navigable entry a distinct icon', () => {
    // A group header may reuse one of its own children's glyphs — it expands/collapses rather
    // than navigates — but borrowing any other entry's glyph is a collision like any other.
    const icons = ALL_ITEMS.flatMap((item) => {
      if (!item.isGroup) {
        return [item.icon];
      }

      const childIcons = item.items.map((child) => child.icon);
      return childIcons.includes(item.icon) ? childIcons : [item.icon, ...childIcons];
    });
    const duplicates = icons.filter((icon, index) => icons.indexOf(icon) !== index);

    expect(duplicates.map((icon) => icon.displayName ?? icon.name)).toEqual([]);
  });

  it('links every navigable entry to exactly one path', () => {
    const paths = navigableItems.map((item) => item.path);

    expect(new Set(paths).size).toBe(paths.length);
  });

  it('translates every group and item in both languages', () => {
    for (const translations of [en, de]) {
      const groups = translations.groups as Record<string, { label?: string; items: Record<string, string> }>;

      for (const item of SIDEBAR_ITEMS) {
        const groupKey = item.isGroup ? item.translationKey : '##default##';
        const group = groups[groupKey];

        expect(group, `missing group "${groupKey}"`).toBeDefined();
        if (item.isGroup) {
          expect(group.label, `missing label for group "${groupKey}"`).toBeTruthy();
        }

        for (const child of item.isGroup ? item.items : [item]) {
          expect(
            group.items[child.translationKey as string],
            `missing "${groupKey}.${child.translationKey}"`,
          ).toBeTruthy();
        }
      }
    }
  });
});
