import { Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { Unauthorized } from './unauthorized/unauthorized';
import { PropsWithChildren, useEffect, useMemo, useState } from 'react';
import { Layout } from './layout/layout';
import { useAuth } from '../hooks/useAuth';
import { useAllRoutes } from './routes';
import usePluginState from './plugins/plugin.state';
import { VerifyEmail } from './verify-email';
import { ToastProvider } from '../components/toastProvider';
import { I18nProvider, RouterProvider, Spinner, useTheme } from '@heroui/react';
import { OpenAPI } from '@attraccess/react-query-client';
import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { hasRequiredPermissions } from './routes/routeAccess';
import PullToRefresh from 'react-simple-pull-to-refresh';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './app.de.json';
import en from './app.en.json';
import { ResetPassword } from './reset-password/resetPassword';
import { UnauthorizedLayout } from './unauthorized/unauthorized-layout/layout';
import { BootScreen } from '../components/bootScreen';
import { usePtrStore } from '../stores/ptr.store';
import { ReactFlowProvider } from '@xyflow/react';
import { AccessDenied } from './unauthorized/accessDenied';
import { getBaseUrl } from '../api';
import { AcceptInvitation } from './accept-invitation';
import { TwoFactorGate } from './two-factor-gate';
import { AttraccessUserActionsBridge } from '../components/attraccessUserActionsBridge';
import { SupervisorApprovalListener } from '../components/supervisorApproval/SupervisorApprovalListener';
import { KioskGuard } from './kiosk/KioskGuard';
import { useLocaleSync } from '../hooks/useLocaleSync';
import { NotFound } from './not-found';

// Exported for settingsAccess.spec.tsx, which drives the real route table through this gate.
export function useRoutesWithAuthElements(routes: RouteConfig[]) {
  const { user, hasPermission } = useAuth();

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

      if (!hasRequiredPermissions(route.authRequired, hasPermission)) {
        return {
          ...route,
          element: <AccessDenied />,
        };
      }

      return route;
    });
  }, [routes, user, hasPermission]);

  return useMemo(
    () =>
      routesWithAuthElements.map((route: RouteConfig) => (
        <Route key={route.path} path={route.path} element={route.element} />
      )),
    [routesWithAuthElements],
  );
}

function useIsTouchDevice() {
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

function AppLayout(props: PropsWithChildren) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { t, language } = useTranslations({ de, en });

  const { pullToRefreshIsEnabled } = usePtrStore();
  const isTouchDevice = useIsTouchDevice();
  const isPullToRefreshActive = pullToRefreshIsEnabled && isTouchDevice;

  const content = (
    <RouterProvider navigate={navigate}>
      <I18nProvider locale={language}>
        <ToastProvider>
          <ReactFlowProvider>
            <AttraccessUserActionsBridge>
              {props.children}
              {isAuthenticated && <SupervisorApprovalListener />}
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
      className="[&_.ptr__pull-down]:z-10"
      onRefresh={() => queryClient.invalidateQueries()}
      pullDownThreshold={90}
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
      isPullable
    >
      {content}
    </PullToRefresh>
  );
}

// Exported for notFound.spec.tsx, which drives the real route table (catch-all included).
export function AppRoutes() {
  const { isAuthenticated } = useAuth();
  const pluginsAreLoading = usePluginState((state) => state.isLoading);
  const allRoutes = useAllRoutes();

  const bareRoutes = useMemo(() => allRoutes.filter((r) => r.noLayout), [allRoutes]);
  const layoutRoutes = useMemo(() => allRoutes.filter((r) => !r.noLayout), [allRoutes]);

  const bareRouteElements = useRoutesWithAuthElements(bareRoutes);
  const layoutRouteElements = useRoutesWithAuthElements(layoutRoutes);

  if (pluginsAreLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-8" role="status" aria-live="polite">
        <Spinner size="sm" />
        <span className="sr-only">Loading plugins</span>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/verify-email" element={<VerifyEmail />} />
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
            <Outlet />
          </Layout>
        }
      >
        {layoutRouteElements}
        {/* Without this a logged-in operator on an unknown path matched nothing at all, so the
            layout route never rendered and the document came up blank (ATT-869). */}
        <Route path="*" element={<NotFound isAuthenticated={isAuthenticated} />} />
      </Route>
    </Routes>
  );
}

function AppContent() {
  return (
    <TwoFactorGate>
      <KioskGuard />
      <AppRoutes />
    </TwoFactorGate>
  );
}

export function App() {
  const { isInitialized } = useAuth();
  const { setTheme } = useTheme();
  useLocaleSync();

  useEffect(() => {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    setTheme(systemTheme);

    let metaTheme = document.querySelector('meta[name="theme-color"]');
    if (!metaTheme) {
      metaTheme = document.createElement('meta');
      metaTheme.setAttribute('name', 'theme-color');
    }

    const darkBackground = 'rgb(0,0,0)';
    const lightBackground = 'rgb(255,255,255)';

    metaTheme.setAttribute('content', systemTheme === 'dark' ? darkBackground : lightBackground);
  }, [setTheme]);

  OpenAPI.BASE = getBaseUrl();

  return <AppLayout>{isInitialized ? <AppContent /> : <BootScreen />}</AppLayout>;
}

export default App;
