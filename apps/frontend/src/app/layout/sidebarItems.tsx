import {
  BookOpenIcon,
  BugIcon,
  CogIcon,
  ComputerIcon,
  DatabaseIcon,
  FileChartColumnIncreasingIcon,
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

  return useMemo(() => {
    // Resources group
    const items: (SidebarItem | SidebarItemGroup)[] = [
      {
        translationKey: 'resources',
        path: '/resources',
        icon: DatabaseIcon,
      },
    ];

    if (license?.modules.includes('attractap')) {
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
    }

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

    if (license?.modules.includes('sso')) {
      authGroup.items.unshift({
        path: '/sso/providers',
        translationKey: 'ssoProviders',
        icon: KeyIcon,
        licenseModule: 'sso',
      });
    }

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
          path: '/csv-export',
          translationKey: 'csvExport',
          icon: FileChartColumnIncreasingIcon,
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
      ],
    });

    return items;
  }, [license]);
}

export const useSidebarEndItems = () => {
  const { user } = useAuth();

  const now = useNow();

  const reportBugUrl = newGithubIssueUrl({
    user: 'Attraccess',
    repo: 'Attraccess',
    title: '[Bug] ',
    labels: ['bug'],
    body: `
### Environment / Umgebung

- **Browser:** ${navigator.userAgent}
- **Screen Size / Bildschirmgröße:** ${window.innerWidth}x${window.innerHeight}
- **Time / Zeit:** ${now.toISOString()}
- **User ID / Benutzer-ID:** ${user?.id || 'Not logged in / Nicht angemeldet'}
- **URL:** ${window.location.href}

### Description / Beschreibung

<!-- Please describe the bug in detail. Include steps to reproduce. -->
<!-- Bitte beschreibe den Fehler im Detail. Füge Schritte zur Reproduktion hinzu. -->
      `,
  });

  const requestFeatureUrl = newGithubIssueUrl({
    user: 'Attraccess',
    repo: 'Attraccess',
    title: '[Feature Request] ',
    labels: ['enhancement'],
    body: `
### Environment / Umgebung

- **Browser:** ${navigator.userAgent}
- **Screen Size / Bildschirmgröße:** ${window.innerWidth}x${window.innerHeight}
- **Time / Zeit:** ${now.toISOString()}
- **User ID / Benutzer-ID:** ${user?.id || 'Not logged in / Nicht angemeldet'}
- **URL:** ${window.location.href}

### Description / Beschreibung

<!-- Please describe the feature request in detail. Explain the use case. -->
<!-- Bitte beschreibe die Funktionsanfrage im Detail. Erkläre den Anwendungsfall. -->
      `,
  });

  return [
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
  ] as SidebarItem[];
};
