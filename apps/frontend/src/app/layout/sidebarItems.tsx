import {
  BookOpenIcon,
  BugIcon,
  CogIcon,
  ComputerIcon,
  DatabaseIcon,
  FileChartColumnIncreasingIcon,
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

export type SidebarItem = {
  path: string;
  icon: React.FunctionComponent<LucideProps>;
  translationKey?: string;
  isExternal?: boolean;
  isGroup?: false;
};

export type SidebarItemGroup = {
  isGroup: true;
  icon: React.FunctionComponent<LucideProps>;
  openByDefault?: boolean;
  items: SidebarItem[];
  translationKey: string;
};

export const sidebarItems: (SidebarItem | SidebarItemGroup)[] = [
  {
    translationKey: 'resources',
    path: '/resources',
    icon: DatabaseIcon,
  },
  {
    translationKey: 'attractap',
    isGroup: true,
    icon: ComputerIcon,
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
  },
  {
    translationKey: 'auth',
    isGroup: true,
    icon: KeyIcon,
    items: [
      {
        path: '/sso/providers',
        translationKey: 'ssoProviders',
        icon: KeyIcon,
      },
      {
        path: '/users',
        translationKey: 'userManagement',
        icon: UsersIcon,
      },
    ],
  },
  {
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
  },
];

export const useSidebarEndItems = () => {
  const { user } = useAuth();

  const reportBugUrl = newGithubIssueUrl({
    user: 'Attraccess',
    repo: 'Attraccess',
    title: '[Bug] ',
    labels: ['bug'],
    body: `
### Environment / Umgebung

- **Browser:** ${navigator.userAgent}
- **Screen Size / Bildschirmgröße:** ${window.innerWidth}x${window.innerHeight}
- **Time / Zeit:** ${new Date().toISOString()}
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
- **Time / Zeit:** ${new Date().toISOString()}
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
      path: getBaseUrl() + '/docs',
      icon: BookOpenIcon,
      translationKey: 'docs',
      isExternal: true,
    },
  ] as SidebarItem[];
};
