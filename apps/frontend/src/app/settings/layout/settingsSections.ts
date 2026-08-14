import type { SystemPermission } from '@attraccess/shared';

/**
 * The settings registry: the single source of truth for what a section is called, where it lives,
 * which group it belongs to and who may see it.
 *
 * The rail, the phone list and the `/settings` redirect all read from here, so adding a section is
 * one entry plus one route — never four places that can disagree. Guarded by settingsSections.spec.ts.
 */

export type SettingsGroupKey = 'instance' | 'access' | 'operations';

/** Group render order. A group with no sections is an orphan; the spec rejects it. */
export const SETTINGS_GROUPS: SettingsGroupKey[] = ['instance', 'access', 'operations'];

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
    key: 'email',
    path: '/settings/email',
    group: 'instance',
    permission: 'system.settings.manage',
  },
  {
    key: 'messaging',
    path: '/settings/messaging',
    group: 'instance',
    permission: 'system.settings.manage',
  },
  // Read-only, so it is the one section with no save bar. It stays a section rather than becoming a
  // panel on General because an aside is reference material *for the fields beside it*, and ten
  // instance-wide facts about version, update status and totals are not that — they are what an
  // operator opens Settings to look up, which is a destination, not a footnote.
  {
    key: 'about',
    path: '/settings/about',
    group: 'instance',
    permission: 'system.settings.manage',
  },
  {
    key: 'security',
    path: '/settings/security',
    group: 'access',
    permission: 'system.settings.manage',
  },
  {
    key: 'roles',
    path: '/settings/roles',
    group: 'access',
    permission: 'system.settings.manage',
  },
  // SSO and Plugins keep the narrower permissions their old routes were gated on. Widening them to
  // `system.settings.manage` because they now share a frame would hand every settings operator two
  // capabilities the RBAC seed deliberately separates; the rail filters per section, so a mixed
  // frame costs nothing.
  {
    key: 'sso',
    path: '/settings/sso',
    group: 'access',
    permission: 'system.sso.manage',
  },
  {
    key: 'monitoring',
    path: '/settings/monitoring',
    group: 'operations',
    permission: 'system.settings.manage',
  },
  {
    key: 'plugins',
    path: '/settings/plugins',
    group: 'operations',
    permission: 'system.plugins.manage',
  },
];
