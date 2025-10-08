import {
  BookOpenIcon,
  BugIcon,
  CogIcon,
  ComputerIcon,
  CreditCardIcon,
  DatabaseIcon,
  FileIcon,
  GiftIcon,
  KeyIcon,
  LightbulbIcon,
  LucideProps,
  MailIcon,
  NfcIcon,
  PackageIcon,
  ServerIcon,
  UsersIcon,
} from 'lucide-react';
import newGithubIssueUrl from 'new-github-issue-url';
import { useAuth } from '../../hooks/useAuth';
import { getBaseUrl } from '../../api';
import { useNow } from '../../hooks/useNow';
import { useLicenseServiceGetLicenseInformation } from '@attraccess/react-query-client';
import { useMemo } from 'react';
import de from './sidebarItems.de.json';
import en from './sidebarItems.en.json';
import { useTranslations } from '@attraccess/plugins-frontend-ui';

export type SidebarItem = {
  path: string;
  icon: React.FunctionComponent<LucideProps>;
  translationKey?: string;
  isExternal?: boolean;
  isGroup?: false;
  licenseModule?: string;
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

  const allItems = useMemo(() => {
    // Resources group
    const items: (SidebarItem | SidebarItemGroup)[] = [
      {
        translationKey: 'resources',
        path: '/resources',
        icon: DatabaseIcon,
      },
    ];

    items.push({
      translationKey: 'attractap',
      isGroup: true,
      icon: ComputerIcon,
      licenseModule: 'attractap',
      items: [
        {
          path: '/nfc-cards',
          translationKey: 'nfcCards',
          icon: NfcIcon,
        },
        {
          path: '/attractap',
          translationKey: 'readers',
          icon: ComputerIcon,
        },
      ],
    });

    items.push({
      path: '/billing',
      translationKey: 'billing',
      icon: CreditCardIcon,
      licenseModule: 'billing',
    });

    // Auth group
    const authGroup: SidebarItemGroup = {
      translationKey: 'auth',
      isGroup: true,
      icon: KeyIcon,
      items: [
        {
          path: '/users',
          translationKey: 'userManagement',
          icon: UsersIcon,
        },
      ],
    };

    authGroup.items.unshift({
      path: '/sso/providers',
      translationKey: 'ssoProviders',
      icon: KeyIcon,
      licenseModule: 'sso',
    });

    items.push(authGroup);

    // System group
    items.push({
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
          path: '/csv-export',
          translationKey: 'csvExport',
          icon: FileIcon,
        },
      ],
    });

    return items;
  }, []);

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
