import { Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { Unauthorized } from './unauthorized/unauthorized';
import { PropsWithChildren, useEffect, useMemo, useState } from 'react';
import { Layout } from './layout/layout';
import { useAuth } from '../hooks/useAuth';
import { useAllRoutes } from './routes';
import { VerifyEmail } from './verify-email';
import { ToastProvider } from '../components/toastProvider';
import { I18nProvider, RouterProvider, Spinner, useTheme } from '@heroui/react';
import { OpenAPI } from '@attraccess/react-query-client';
import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { type SystemPermission } from '@attraccess/shared';
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

function useRoutesWithAuthElements(routes: RouteConfig[]) {
  const { user, hasPermission } = useAuth();

  const routesWithAuthElements = useMemo(() => {
    return routes.map((route) => {
      if (!route.authRequired) {
        return route;
      }

      if (route.authRequired === true && user) {
        return route;
      }

      if (!user) {
        return {
          ...route,
          element: <Unauthorized />,
        };
      }

      const requiredPermissions = (
        Array.isArray(route.authRequired) ? route.authRequired : [route.authRequired]
      ) as SystemPermission[];

      const userHasAllRequiredPermissions = requiredPermissions.every(
        (permission) => hasPermission(permission),
      );

      if (!userHasAllRequiredPermissions) {
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

function AppContent() {
  const { isAuthenticated } = useAuth();
  const allRoutes = useAllRoutes();

  const bareRoutes = useMemo(() => allRoutes.filter((r) => r.noLayout), [allRoutes]);
  const layoutRoutes = useMemo(() => allRoutes.filter((r) => !r.noLayout), [allRoutes]);

  const bareRouteElements = useRoutesWithAuthElements(bareRoutes);
  const layoutRouteElements = useRoutesWithAuthElements(layoutRoutes);

  return (
    <TwoFactorGate>
      <KioskGuard />
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

        <Route element={<Layout><Outlet /></Layout>}>
          {layoutRouteElements}
          {!isAuthenticated && <Route path="*" element={<Unauthorized />} />}
        </Route>
      </Routes>
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
