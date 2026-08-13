import type { SystemPermission } from '@attraccess/shared';

/**
 * The settings registry: the single source of truth for what a section is called, where it lives,
 * which group it belongs to and who may see it.
 *
 * The rail, the phone list and the `/settings` redirect all read from here, so adding a section is
 * one entry plus one route — never four places that can disagree. Guarded by settingsSections.spec.ts.
 */

export type SettingsGroupKey = 'instance' | 'operations';

/** Group render order. A group with no sections is an orphan; the spec rejects it. */
export const SETTINGS_GROUPS: SettingsGroupKey[] = ['instance', 'operations'];

export interface SettingsSectionDef {
  /** Stable identifier, also the translation key for the section's rail label. */
  key: string;
  path: string;
  group: SettingsGroupKey;
  /** Every section is permissioned; the rail hides what the operator may not open. */
  permission: SystemPermission;
}

export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  {
    key: 'general',
    path: '/settings/general',
    group: 'instance',
    permission: 'system.settings.manage',
  },
  {
    key: 'monitoring',
    path: '/settings/monitoring',
    group: 'operations',
    permission: 'system.settings.manage',
  },
  {
    // Brought forward from 2/3: `/settings` was the only mount point for the version and system-info
    // cards, so without this section the redesign would drop them until 2/3 landed.
    key: 'about',
    path: '/settings/about',
    group: 'operations',
    permission: 'system.settings.manage',
  },
];
