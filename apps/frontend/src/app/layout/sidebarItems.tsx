import {
  ActivityIcon,
  BellIcon,
  BookOpenIcon,
  BugIcon,
  CogIcon,
  CreditCardIcon,
  DatabaseIcon,
  FileSpreadsheetIcon,
  FolderIcon,
  GiftIcon,
  IdCardIcon,
  KeyRoundIcon,
  LightbulbIcon,
  LucideProps,
  MailIcon,
  MessageSquareIcon,
  MonitorSmartphoneIcon,
  NfcIcon,
  PackageIcon,
  SendIcon,
  Settings2Icon,
  ServerIcon,
  ShieldIcon,
  UsersIcon,
} from 'lucide-react';
import newGithubIssueUrl from 'new-github-issue-url';
import { useAuth } from '../../hooks/useAuth';
import { getBaseUrl } from '../../api';
import { useNow } from '../../hooks/useNow';
import {
  useLicenseServiceGetLicenseInformation,
  useMessagingServiceMessagingGetUnreadCount,
} from '@attraccess/react-query-client';
import { useMemo } from 'react';
import de from './sidebarItems.de.json';
import en from './sidebarItems.en.json';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { BalenaIcon } from '../balena/balena-icon';

export type SidebarItem = {
  path: string;
  icon: React.FunctionComponent<LucideProps>;
  translationKey?: string;
  isExternal?: boolean;
  isGroup?: false;
  licenseModule?: string;
  badgeCount?: number;
  /** Entry displays the unread-message count. Set on the entry so the badge never keys off a path string. */
  showsUnreadCount?: true;
};

export type SidebarItemGroup = {
  isGroup: true;
  icon: React.FunctionComponent<LucideProps>;
  items: SidebarItem[];
  translationKey: string;
  licenseModule?: string;
};

// Takes LucideProps like every other sidebar icon, so callers can size it the same way. `size` is
// lucide-only and would land on the <svg> as an invalid attribute, so it is translated here.
const BalenaSidebarIcon = ({ size = 16, ...props }: LucideProps) => (
  <BalenaIcon {...props} width={size} height={size} />
);

/**
 * The navigation tree. Groups are named after what an operator is looking for, never after
 * the absence of a better name — the former "System" catch-all is split into "Notifications"
 * and "Instance", and identity/authorisation lives in a single "Users & Access" group.
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
    // Who can log in, and what they're allowed to do.
    translationKey: 'users',
    isGroup: true,
    icon: UsersIcon,
    items: [
      {
        path: '/users',
        translationKey: 'userList',
        icon: UsersIcon,
      },
      {
        path: '/settings/roles',
        translationKey: 'roles',
        icon: IdCardIcon,
      },
      {
        path: '/users/security',
        translationKey: 'userSecurity',
        icon: ShieldIcon,
      },
      {
        path: '/sso/providers',
        translationKey: 'sso',
        icon: KeyRoundIcon,
        licenseModule: 'sso',
      },
    ],
  },
  {
    // Hardware and fleets this instance talks to.
    translationKey: 'devices',
    isGroup: true,
    icon: MonitorSmartphoneIcon,
    items: [
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
    // How the instance sends messages out.
    translationKey: 'notifications',
    isGroup: true,
    icon: BellIcon,
    items: [
      {
        path: '/emails',
        translationKey: 'emails',
        icon: MailIcon,
      },
      {
        path: '/messages/settings',
        translationKey: 'messagingSettings',
        icon: SendIcon,
      },
    ],
  },
  {
    // This installation itself: its configuration, extensions, and health.
    translationKey: 'instance',
    isGroup: true,
    icon: CogIcon,
    items: [
      {
        path: '/settings',
        translationKey: 'settings',
        icon: Settings2Icon,
      },
      {
        path: '/plugins',
        translationKey: 'plugins',
        icon: PackageIcon,
      },
      {
        path: '/monitoring',
        translationKey: 'monitoring',
        icon: ActivityIcon,
      },
    ],
  },
];

export function useSidebarItems(): (SidebarItem | SidebarItemGroup)[] {
  const { data: license } = useLicenseServiceGetLicenseInformation();
  const { data: unread } = useMessagingServiceMessagingGetUnreadCount();

  const allItems = useMemo(() => {
    return SIDEBAR_ITEMS.map((item) =>
      'showsUnreadCount' in item ? { ...item, badgeCount: unread?.total } : item,
    );
  }, [unread?.total]);

  return useMemo(() => {
    if (!license) {
      return [];
    }

    const itemsMatchingLicense = [] as typeof allItems;

    allItems.forEach((item) => {
      if (item.licenseModule && !license?.modules.includes(item.licenseModule)) {
        return;
      }

      if (!item.isGroup) {
        itemsMatchingLicense.push(item);
        return;
      }

      const itemChildrenMatchingLicense = (item as SidebarItemGroup).items.filter((item) => {
        if (item.licenseModule && !license?.modules.includes(item.licenseModule)) {
          return false;
        }

        return true;
      });

      if (itemChildrenMatchingLicense.length === 0) {
        return;
      }

      itemsMatchingLicense.push({
        ...item,
        items: itemChildrenMatchingLicense,
      });
    });

    return itemsMatchingLicense;
  }, [allItems, license]);
}

export const useSidebarEndItems = () => {
  const { user } = useAuth();

  const { t } = useTranslations({
    en,
    de,
  });

  const now = useNow();

  const url = new URL(window.location.href);
  url.hostname = 'redacted.hostname';

  const reportBugUrl = newGithubIssueUrl({
    user: 'Attraccess',
    repo: 'Attraccess',
    title: t('reportBug.title'),
    labels: ['bug'],
    body: t('reportBug.body', {
      browser: navigator.userAgent,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      time: now.toISOString(),
      userId: user?.id || t('notLoggedIn'),
      url: url.toString(),
    }),
  });

  const requestFeatureUrl = newGithubIssueUrl({
    user: 'Attraccess',
    repo: 'Attraccess',
    title: t('requestFeature.title'),
    labels: ['enhancement'],
    body: t('requestFeature.body', {
      browser: navigator.userAgent,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      time: now.toISOString(),
      userId: user?.id || t('notLoggedIn'),
      url: url.toString(),
    }),
  });

  return [
    {
      isGroup: true,
      icon: MailIcon,
      translationKey: 'feedback',
      items: [
        {
          path: reportBugUrl,
          icon: BugIcon,
          translationKey: 'reportBug',
          isExternal: true,
        },
        {
          path: requestFeatureUrl,
          icon: LightbulbIcon,
          translationKey: 'requestFeature',
          isExternal: true,
        },
      ],
    },
    {
      path: '/dependencies',
      icon: PackageIcon,
      translationKey: 'dependencies',
    },
    {
      path: '/changelog',
      icon: GiftIcon,
      translationKey: 'changelog',
    },
    {
      path: getBaseUrl() + '/docs',
      icon: BookOpenIcon,
      translationKey: 'docs',
      isExternal: true,
    },
  ] as (SidebarItem | SidebarItemGroup)[];
};
