import { PageHeader, RoutedTabs, StatusAlert, type RoutedTabItem } from '@attraccess/plugins-frontend-ui';
import { Spinner } from '@heroui/react';
import { CableIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useMatterTranslations } from './i18n';
import { MatterConnectionProvider } from './MatterConnectionContext';
import { MatterDegradedBanner } from './MatterDegradedBanner';
import { MATTER_BASE_PATH } from './matterPaths';
import { MATTER_TABS } from './matterTabs';
import { useMatterPermissions } from './permissions';
import { activeMatterTab } from './activeMatterTab';
import { useMatterPage } from './useMatterPage';

/**
 * The layout of every `/matter/*` route (the plugin registers one flat route per subpage, all rendering this): header,
 * the global banner, the routed tabs and the active tab's content.
 *
 * A user sees the tabs their permissions allow (see matterTabs.tsx). `/matter`, an unknown subpath and a tab the user
 * may not see all land on the first visible tab (a replace, so back does not loop); a user with no visible tab gets a
 * notice. Until the host has pushed the auth state, the page only loads: no notice flashes and nothing is requested.
 * Each tab loads its own data, so one failing request never blanks the others.
 */
export function MatterPage() {
  const { t } = useMatterTranslations();
  const permissions = useMatterPermissions();
  const location = useLocation();
  const visible = useMemo(() => MATTER_TABS.filter((tab) => tab.isVisible(permissions)), [permissions]);
  const active = activeMatterTab(visible, location.pathname);
  // The settings are polled only while the tab that edits them is open.
  const connection = useMatterPage(permissions, active?.key === 'infrastructure');
  const items = useMemo<RoutedTabItem[]>(
    () => visible.map((tab) => ({ key: tab.key, label: t(`tabs.${tab.key}`), icon: tab.icon, path: tab.path })),
    [visible, t],
  );
  // The same element while the tab stays: a status poll re-renders the layout, not the whole tab.
  const Content = active?.Content;
  const content = useMemo(() => (Content ? <Content /> : null), [Content]);

  const header = (
    <PageHeader
      noMargin
      icon={<CableIcon className="mt:h-6 mt:w-6 mt:text-accent-soft-foreground" />}
      title={t('page.title')}
      subtitle={t('page.subtitle')}
    />
  );
  const shell = (children: React.ReactNode) => (
    <div
      className="mt:mx-auto mt:flex mt:w-full mt:min-w-0 mt:max-w-5xl mt:flex-col mt:gap-4 mt:p-4 mt:md:p-6"
      data-cy="matter-page"
    >
      {header}
      {children}
    </div>
  );

  if (!permissions.known) return shell(<Spinner data-cy="matter-page-loading" />);
  if (visible.length === 0) {
    return shell(
      <StatusAlert status="default" title={t('page.noDeviceAccess')} data-cy="matter-no-device-access">
        {t('page.noDeviceAccessText')}
      </StatusAlert>,
    );
  }

  if (!active) return <Navigate to={`${MATTER_BASE_PATH}/${visible[0].path}`} replace />;

  return (
    <MatterConnectionProvider value={connection}>
      {shell(
        <>
          <MatterDegradedBanner permissions={permissions} onInfrastructure={active.key === 'infrastructure'} />
          <RoutedTabs items={items} basePath={MATTER_BASE_PATH} aria-label={t('tabs.label')} data-cy="matter-tabs" />
          <div className="mt:min-w-0" data-cy={`matter-tab-${active.key}`}>
            {content}
          </div>
        </>,
      )}
    </MatterConnectionProvider>
  );
}
