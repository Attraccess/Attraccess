import { describe, expect, it } from 'vitest';
import { SETTINGS_GROUPS, SETTINGS_SECTION_PERMISSIONS, SETTINGS_SECTIONS } from './settingsSections';
import de from './de.json';
import en from './en.json';

describe('settings section registry', () => {
  it('gives every section a unique key', () => {
    const keys = SETTINGS_SECTIONS.map((section) => section.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every section a unique path below /settings/', () => {
    const paths = SETTINGS_SECTIONS.map((section) => section.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.filter((path) => !path.startsWith('/settings/'))).toEqual([]);
  });

  it('permissions every section', () => {
    // A section without a permission is a section the rail cannot hide, which is how an operator
    // ends up clicking through to a 403.
    expect(SETTINGS_SECTIONS.filter((section) => !section.permission)).toEqual([]);
  });

  it('opens the /settings gate to every section permission, listed once each', () => {
    // This list is what `/settings` is gated on. A permission missing from it is a section whose
    // operator cannot reach the shell that now contains it.
    expect(new Set(SETTINGS_SECTION_PERMISSIONS)).toEqual(new Set(SETTINGS_SECTIONS.map((s) => s.permission)));
    expect(SETTINGS_SECTION_PERMISSIONS.length).toBe(new Set(SETTINGS_SECTION_PERMISSIONS).size);
  });

  it('declares no group without sections and no section outside a declared group', () => {
    const used = new Set(SETTINGS_SECTIONS.map((section) => section.group));
    expect(SETTINGS_GROUPS.filter((group) => !used.has(group))).toEqual([]);
    expect(SETTINGS_SECTIONS.filter((section) => !SETTINGS_GROUPS.includes(section.group))).toEqual([]);
  });

  it('translates every group and section in both languages', () => {
    for (const translations of [en, de]) {
      for (const group of SETTINGS_GROUPS) {
        expect(translations.groups[group], `missing group "${group}"`).toBeTruthy();
      }
      for (const section of SETTINGS_SECTIONS) {
        const entry = (translations.sections as Record<string, { label?: string } | undefined>)[section.key];
        expect(entry?.label, `missing section "${section.key}"`).toBeTruthy();
      }
    }
  });
});
