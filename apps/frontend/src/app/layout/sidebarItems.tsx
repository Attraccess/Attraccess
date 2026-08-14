import {
  BookOpenIcon,
  BoxIcon,
  BugIcon,
  CreditCardIcon,
  DatabaseIcon,
  FileSpreadsheetIcon,
  FolderIcon,
  GiftIcon,
  LightbulbIcon,
  LucideProps,
  MessageSquareIcon,
  MonitorSmartphoneIcon,
  NfcIcon,
  PackageIcon,
  ScanLineIcon,
  Settings2Icon,
  ServerIcon,
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

export function useSidebarItems(): (SidebarItem | SidebarItemGroup)[] {
  const { data: license } = useLicenseServiceGetLicenseInformation();
  const { data: unread } = useMessagingServiceMessagingGetUnreadCount();

  const allItems = useMemo(() => {
    return SIDEBAR_ITEMS.map((item) => ('showsUnreadCount' in item ? { ...item, badgeCount: unread?.total } : item));
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

  return buildSidebarEndItems(reportBugUrl, requestFeatureUrl);
};

/**
 * The bottom nav tree. Split out of the hook so sidebarItems.spec.tsx can check it for icon
 * collisions against SIDEBAR_ITEMS — both trees render in the same sidebar at the same time.
 * The two GitHub issue URLs are the only parts that need the hook's context.
 */
export const buildSidebarEndItems = (
  reportBugUrl: string,
  requestFeatureUrl: string,
): (SidebarItem | SidebarItemGroup)[] => {
  return [
    {
      isGroup: true,
      // A child's glyph rather than an envelope: Feedback opens GitHub issues, it does not send mail.
      icon: LightbulbIcon,
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
      isGroup: true,
      icon: BookOpenIcon,
      translationKey: 'docsAndTools',
      items: [
        {
          path: getBaseUrl() + '/docs',
          icon: BookOpenIcon,
          translationKey: 'docs',
          isExternal: true,
        },
        {
          path: '/printables',
          icon: BoxIcon,
          translationKey: 'printables',
        },
      ],
    },
  ] as (SidebarItem | SidebarItemGroup)[];
};
