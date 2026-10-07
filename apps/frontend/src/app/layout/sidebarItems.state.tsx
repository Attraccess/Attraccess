import { LucideProps } from 'lucide-react';
import { BalenaIcon } from '../balena/balena-icon';
import { BookOpenIcon } from 'lucide-react';
import { BoxIcon } from 'lucide-react';
import { BugIcon } from 'lucide-react';
import { GiftIcon } from 'lucide-react';
import { LightbulbIcon } from 'lucide-react';
import { PackageIcon } from 'lucide-react';
import { getBaseUrl } from '../../api';
import type { SidebarItem } from './sidebarItems.contracts';
import type { SidebarItemGroup } from './sidebarItems.contracts';
import newGithubIssueUrl from 'new-github-issue-url';
import { useAuth } from '../../hooks/useAuth';
import { useNow } from '../../hooks/useNow';
import de from './sidebarItems.de.json';
import en from './sidebarItems.en.json';
import { useTranslations } from '@attraccess/plugins-frontend-ui';

export // Takes LucideProps like every other sidebar icon, so callers can size it the same way. `size` is
// lucide-only and would land on the <svg> as an invalid attribute, so it is translated here.
const BalenaSidebarIcon = ({ size = 16, ...props }: LucideProps) => (
  <BalenaIcon {...props} width={size} height={size} />
);

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
