import { LiveUpdatesProvider } from '../utils/live-updates';
import { TwoFactorGate } from './two-factor-gate/index';
import { KioskGuard } from './kiosk/KioskGuard';
import { matchPath, useLocation, useNavigate, Outlet, Route, Routes } from 'react-router-dom';
import { PropsWithChildren, useMemo, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { ToastProvider } from '../components/toastProvider';
import { I18nProvider, RouterProvider, Spinner } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeaderAccessoryProvider, useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './app.de.json';
import en from './app.en.json';
import { usePtrStore } from '../stores/ptr.store';
import { ReactFlowProvider } from '@xyflow/react';
import { AttraccessUserActionsBridge } from '../components/attraccessUserActionsBridge/index';
import { SupervisorApprovalListener } from '../components/supervisorApproval/SupervisorApprovalListener';
import { EnrollLinkDialog } from './attractap/pairing/EnrollLinkDialog';
import { MassIntroductionRedeemModal } from './mass-introduction/MassIntroductionRedeemModal';
import { PwaUpdateIndicator } from '../pwa-update/PwaUpdateIndicator';
import { ThemeToggle } from '../components/themeToggle';
import { PullToRefresh } from '../components/pullToRefresh';
import { InstallAppButton, InstallAppPrompts } from '../pwa-install';
import { SessionBillingSummary } from './billing/sessionSummary/index';
import { Layout } from './layout/layout';
import { DashboardPinHeaderAccessory } from './dashboard/DashboardPinToggle';
import { PinnablePagesProvider } from './dashboard/pinnablePages';
import { DashboardWidgetsProvider } from './dashboard/widgets/DashboardWidgetsProvider';
import { useAllRoutes } from './routes/index';
import { VerifyEmail } from './verify-email/index';
import { ResetPassword } from './reset-password/resetPassword';
import { UnauthorizedLayout } from './unauthorized/unauthorized-layout/layout';
import { AcceptInvitation } from './accept-invitation/index';
import { NotFound } from './not-found/index';
import { BootScreen } from '../components/bootScreen/index';
import { configureApiClient } from '../api/index';
import { useLocaleSync } from '../hooks/useLocaleSync';
import { useDateTimePreferencesSync } from '../hooks/useDateTimePreferencesSync';
import { Unauthorized } from './unauthorized/unauthorized';
import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { hasRequiredPermissions } from './routes/routeAccess';
import { AccessDenied } from './unauthorized/accessDenied';
import usePluginState from './plugins/plugin.state';

export function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(pointer: coarse)');
    const handler = (event: MediaQueryListEvent) => setIsTouch(event.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isTouch;
}

// Exported for settingsAccess.spec.tsx, which drives the real route table through this gate.
export function useRoutesWithAuthElements(routes: RouteConfig[]) {
  const { user, hasPermissionKey } = useAuth();

  const routesWithAuthElements = useMemo(() => {
    return routes.map((route) => {
      if (!route.authRequired) {
        return route;
      }

      if (!user) {
        return {
          ...route,
          element: <Unauthorized />,
        };
      }

      // `true` = any logged-in user, which the check above just established.
      if (route.authRequired === true) {
        return route;
      }

      if (!hasRequiredPermissions(route.authRequired, hasPermissionKey)) {
        return {
          ...route,
          element: <AccessDenied />,
        };
      }

      return route;
    });
  }, [routes, user, hasPermissionKey]);

  return useMemo(
    () =>
      routesWithAuthElements.map((route: RouteConfig) => (
        <Route key={route.path} path={route.path} element={route.element} />
      )),
    [routesWithAuthElements],
  );
}

// Exported for notFound.spec.tsx, which drives the real route table (catch-all included).
export function AppRoutes() {
  const { isAuthenticated } = useAuth();
  const allRoutes = useAllRoutes();
  const arePluginsInitialized = usePluginState((state) => state.isInitialized);

  const bareRoutes = useMemo(() => allRoutes.filter((r) => r.noLayout), [allRoutes]);
  const layoutRoutes = useMemo(() => allRoutes.filter((r) => !r.noLayout), [allRoutes]);

  const bareRouteElements = useRoutesWithAuthElements(bareRoutes);
  const layoutRouteElements = useRoutesWithAuthElements(layoutRoutes);

  return (
    <Routes>
      <Route
        path="/verify-email"
        element={
          <UnauthorizedLayout>
            <VerifyEmail />
          </UnauthorizedLayout>
        }
      />
      <Route
        path="/accept-invitation"
        element={
          <UnauthorizedLayout>
            <AcceptInvitation />
          </UnauthorizedLayout>
        }
      />
      <Route
        path="/reset-password"
        element={
          <UnauthorizedLayout>
            <ResetPassword />
          </UnauthorizedLayout>
        }
      />

      {bareRouteElements}

      <Route
        element={
          <Layout>
            {/* Page headers inside the app layout get the dashboard pin. Kiosk routes have no layout. */}
            <PinnablePagesProvider>
              <DashboardWidgetsProvider>
                <PageHeaderAccessoryProvider accessory={DashboardPinHeaderAccessory}>
                  <Outlet />
                </PageHeaderAccessoryProvider>
              </DashboardWidgetsProvider>
            </PinnablePagesProvider>
          </Layout>
        }
      >
        {layoutRouteElements}
        {/* Without this a logged-in operator on an unknown path matched nothing at all, so the
            layout route never rendered and the document came up blank (ATT-869). */}
        {/* Plugin pages exist only once plugins have loaded: until then an unknown path may still be one of them,
            for example a public plugin page opened straight from its link. */}
        <Route
          path="*"
          element={
            arePluginsInitialized ? (
              <NotFound isAuthenticated={isAuthenticated} />
            ) : (
              <div className="flex justify-center py-16" data-cy="plugins-loading">
                <Spinner />
              </div>
            )
          }
        />
      </Route>
    </Routes>
  );
}

export function AppContent() {
  return (
    <TwoFactorGate>
      <KioskGuard />
      <AppRoutes />
    </TwoFactorGate>
  );
}

/** Whether the current page is a plugin page without the app shell (for example a public display screen). */
function useIsBarePluginPage(pathname: string): boolean {
  const plugins = usePluginState((state) => state.plugins);
  return useMemo(
    () =>
      plugins.some((manifest) => {
        try {
          return (manifest.plugin.getRoutes?.() ?? []).some(
            (route) => route.noLayout && route.path && matchPath(route.path, pathname),
          );
        } catch {
          return false;
        }
      }),
    [plugins, pathname],
  );
}

export function AppLayout(props: PropsWithChildren) {
  const { isAuthenticated, needsTwoFactorSetup, user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isKiosk = pathname.startsWith('/kiosk/');
  // A bare plugin page fills the screen on its own: no floating theme and install buttons over it.
  const isBarePluginPage = useIsBarePluginPage(pathname);

  const { t, language } = useTranslations({ de, en });

  const { pullToRefreshIsEnabled } = usePtrStore();
  const isTouchDevice = useIsTouchDevice();
  const isPullToRefreshActive = pullToRefreshIsEnabled && isTouchDevice;

  const content = (
    <RouterProvider navigate={navigate}>
      <I18nProvider locale={language}>
        <ToastProvider>
          {(!isAuthenticated || needsTwoFactorSetup) && !isBarePluginPage && (
            <div className="fixed top-4 right-4 z-30 flex gap-1">
              {!isKiosk && <InstallAppButton />}
              <ThemeToggle />
            </div>
          )}
          <PwaUpdateIndicator />
          {!isKiosk && !isBarePluginPage && <InstallAppPrompts />}
          <ReactFlowProvider>
            <AttraccessUserActionsBridge>
              {props.children}
              {/* Mass-introduction QR codes: claimed before sign-in, redeemed after (ATT-1151). */}
              <MassIntroductionRedeemModal canRedeem={isAuthenticated && !needsTwoFactorSetup} />
              {/* A touch reader's QR code links here; the admin approves with the code (not a global enroll button). */}
              <EnrollLinkDialog
                signedIn={isAuthenticated && !needsTwoFactorSetup}
                canEnroll={hasPermission('resources.update')}
              />
              {isAuthenticated && <SupervisorApprovalListener />}
              {isAuthenticated && <SessionBillingSummary key={user?.id} />}
            </AttraccessUserActionsBridge>
          </ReactFlowProvider>
        </ToastProvider>
      </I18nProvider>
    </RouterProvider>
  );

  if (!isPullToRefreshActive) {
    return content;
  }

  return (
    <PullToRefresh
      onRefresh={() => queryClient.invalidateQueries()}
      threshold={90}
      refreshingContent={
        <div className="flex h-[90px] items-center justify-center pt-[env(safe-area-inset-top)]">
          <Spinner size="sm" />
        </div>
      }
      pullingContent={
        <div className="flex flex-col items-center gap-2 p-2">
          <div className="text-sm">{t('pullToRefresh')}</div>
          <div className="text-2xl leading-none">↓</div>
        </div>
      }
    >
      {content}
    </PullToRefresh>
  );
}

export function App() {
  const { isInitialized, user, needsTwoFactorSetup, isTwoFactorStatusLoading } = useAuth();
  useLocaleSync();
  useDateTimePreferencesSync();

  configureApiClient();

  return (
    <LiveUpdatesProvider userId={!isTwoFactorStatusLoading && !needsTwoFactorSetup ? user?.id : undefined}>
      <AppLayout>{isInitialized ? <AppContent /> : <BootScreen />}</AppLayout>
    </LiveUpdatesProvider>
  );
}

// Exported for settingsAccess.spec.tsx, which drives the real route table through this gate.
// Exported for notFound.spec.tsx, which drives the real route table (catch-all included).
export default App;
