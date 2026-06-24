import {
  BookOpenIcon,
  BugIcon,
  CogIcon,
  CreditCardIcon,
  DatabaseIcon,
  FileIcon,
  FolderIcon,
  GiftIcon,
  LightbulbIcon,
  LucideProps,
  MailIcon,
  MessageSquareIcon,
  MonitorSmartphoneIcon,
  NfcIcon,
  PackageIcon,
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
};

export type SidebarItemGroup = {
  isGroup: true;
  icon: React.FunctionComponent<LucideProps>;
  items: SidebarItem[];
  translationKey: string;
  licenseModule?: string;
};

export function useSidebarItems(): (SidebarItem | SidebarItemGroup)[] {
  const { data: license } = useLicenseServiceGetLicenseInformation();
  const { data: unread } = useMessagingServiceMessagingGetUnreadCount();

  const allItems = useMemo(() => {
    // Resources group
    const items: (SidebarItem | SidebarItemGroup)[] = [
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
        badgeCount: unread?.total,
      },
    ];

    items.push({
      translationKey: 'attractap',
      path: '/attractap/nfc-cards',
      icon: NfcIcon,
      licenseModule: 'attractap',
    });

    items.push({
      path: '/billing',
      translationKey: 'billing',
      icon: CreditCardIcon,
      licenseModule: 'billing',
    });

    items.push({
      path: '/users',
      translationKey: 'userManagement',
      icon: UsersIcon,
    });

    // System group
    const systemGroup: SidebarItemGroup = {
      translationKey: 'system',
      isGroup: true,
      icon: CogIcon,
      items: [
        {
          path: '/mqtt/servers',
          translationKey: 'mqttServers',
          icon: ServerIcon,
        },
        {
          path: '/plugins',
          translationKey: 'plugins',
          icon: PackageIcon,
        },
        {
          path: '/email-templates',
          translationKey: 'emailTemplates',
          icon: MailIcon,
        },
        {
          path: '/settings',
          translationKey: 'settings',
          icon: Settings2Icon,
        },
        {
          path: '/settings/companion',
          translationKey: 'companion',
          icon: MonitorSmartphoneIcon,
        },
        {
          path: '/csv-export',
          translationKey: 'csvExport',
          icon: FileIcon,
        },
      ],
    };

    systemGroup.items.push({
      path: '/balena',
      translationKey: 'balena',
      icon: (props: React.SVGProps<SVGSVGElement>) => <BalenaIcon {...props} width={16} height={16} />,
      licenseModule: 'balena',
    });

    items.push(systemGroup);

    return items;
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
