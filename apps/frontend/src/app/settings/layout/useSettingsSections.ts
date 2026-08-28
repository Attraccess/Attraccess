import { useMemo } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { SETTINGS_GROUPS, SETTINGS_SECTIONS, type SettingsGroupKey, type SettingsSectionDef } from './settingsSections';

export interface SettingsGroup {
  key: SettingsGroupKey;
  sections: SettingsSectionDef[];
}

/**
 * The registry narrowed to what this operator may open, in group order. Groups that end up empty
 * drop out, so the rail never shows a heading with nothing under it.
 *
 * Kept out of `settingsSections.ts` so the registry stays a plain module the spec can import
 * without dragging in auth and react-query.
 */
export function useSettingsSections(): { sections: SettingsSectionDef[]; groups: SettingsGroup[] } {
  const { hasPermission } = useAuth();

  return useMemo(() => {
    const sections = SETTINGS_SECTIONS.filter((section) => hasPermission(section.permission));
    const groups = SETTINGS_GROUPS.map((key) => ({
      key,
      sections: sections.filter((section) => section.group === key),
    })).filter((group) => group.sections.length > 0);

    return { sections, groups };
  }, [hasPermission]);
}
