import { describe, expect, it } from 'vitest';
import { SIDEBAR_ITEMS } from './sidebarItems';
import de from './sidebar.de.json';
import en from './sidebar.en.json';

// `isGroup` discriminates the union, so this narrows to SidebarItem[] without a cast.
const navigableItems = SIDEBAR_ITEMS.flatMap((item) => (item.isGroup ? item.items : [item]));

describe('SIDEBAR_ITEMS', () => {
  it('gives every navigable entry a distinct icon', () => {
    // Group headers are excluded on purpose: they expand/collapse rather than navigate, so
    // reusing their most representative child's glyph is a deliberate decision, not a collision.
    const icons = navigableItems.map((item) => item.icon);
    const duplicates = icons.filter((icon, index) => icons.indexOf(icon) !== index);

    expect(duplicates).toEqual([]);
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
          expect(group.items[child.translationKey as string], `missing "${groupKey}.${child.translationKey}"`).toBeTruthy();
        }
      }
    }
  });
});
