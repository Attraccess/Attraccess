import {
  CreditCardIcon,
  DatabaseIcon,
  FileSpreadsheetIcon,
  FolderIcon,
  MessageSquareIcon,
  MonitorSmartphoneIcon,
  NfcIcon,
  ScanLineIcon,
  Settings2Icon,
  ServerIcon,
  UsersIcon,
} from 'lucide-react';
import type { SidebarItem } from './sidebarItems.contracts';
import type { SidebarItemGroup } from './sidebarItems.contracts';
import { BalenaSidebarIcon } from './sidebarItems.state';

/**
 * The navigation tree. Groups are named after what an operator is looking for, never after
 * the absence of a better name. Everything an operator configures about this installation now
 * lives behind the single "Settings" entry and its rail, so the former "Notifications" and
 * "Instance" groups are gone and "Users & Access" is back to one entry: the user list.
 *
 * Every navigable entry carries a distinct icon; group headers may reuse their most
 * representative child's glyph since they only expand/collapse. Guarded by sidebarItems.spec.tsx.
 */
export const SIDEBAR_ITEMS: (SidebarItem | SidebarItemGroup)[] = [
  {
    translationKey: 'resources',
    path: '/resources',
    icon: DatabaseIcon,
  },
  {
    translationKey: 'projects',
    path: '/projects',
    icon: FolderIcon,
  },
  {
    translationKey: 'messages',
    path: '/messages',
    icon: MessageSquareIcon,
    showsUnreadCount: true,
  },
  {
    translationKey: 'attractap',
    path: '/attractap/nfc-cards',
    icon: NfcIcon,
    licenseModule: 'attractap',
  },
  {
    path: '/billing',
    translationKey: 'billing',
    icon: CreditCardIcon,
    licenseModule: 'billing',
  },
  {
    // Sits next to Billing rather than in a group: it is billing.manage while every other
    // admin page here is system.settings.manage, and a group spanning two permissions shows
    // different operators different, incoherent versions of itself.
    path: '/csv-export',
    translationKey: 'csvExport',
    icon: FileSpreadsheetIcon,
  },
  {
    // Who can log in. What they're allowed to do — roles, login security, SSO — is configuration,
    // and lives in Settings with the rest of it.
    path: '/users',
    translationKey: 'users',
    icon: UsersIcon,
  },
  {
    // Hardware and fleets this instance talks to.
    translationKey: 'devices',
    isGroup: true,
    icon: MonitorSmartphoneIcon,
    items: [
      {
        path: '/attractap/readers',
        translationKey: 'attractapReaders',
        icon: ScanLineIcon,
        licenseModule: 'attractap',
      },
      {
        path: '/devices/mqtt/servers',
        translationKey: 'mqttServers',
        icon: ServerIcon,
      },
      {
        path: '/devices/companion',
        translationKey: 'companion',
        icon: MonitorSmartphoneIcon,
      },
      {
        path: '/balena',
        translationKey: 'balena',
        icon: BalenaSidebarIcon,
        licenseModule: 'balena',
      },
    ],
  },
  {
    // One way in to everything about this installation: its configuration, extensions and health.
    path: '/settings',
    translationKey: 'settings',
    icon: Settings2Icon,
  },
];
