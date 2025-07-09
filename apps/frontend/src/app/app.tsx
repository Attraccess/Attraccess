import { Route, Routes, useNavigate } from 'react-router-dom';
import { Unauthorized } from './unauthorized/unauthorized';
import { useTheme } from '@heroui/use-theme';
import { PropsWithChildren, useEffect, useMemo } from 'react';
import { Layout } from './layout/layout';
import { useAuth, usePersistedAuth } from '../hooks/useAuth';
import { useAllRoutes } from './routes';
import { VerifyEmail } from './verifyEmail';
import { ToastProvider } from '../components/toastProvider';
import { HeroUIProvider, Spinner } from '@heroui/react';
import { SystemPermissions } from '@attraccess/react-query-client';
import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import PullToRefresh from 'react-simple-pull-to-refresh';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './app.de.json';
import en from './app.en.json';
import { ResetPassword } from './reset-password/resetPassword';
import { UnauthorizedLayout } from './unauthorized/unauthorized-layout/layout';
import { PWAUpdatePrompt } from '../components/PWAUpdatePrompt';
import { BootScreen } from '../components/bootScreen';
import { usePtrStore } from '../stores/ptr.store';
import { ReactFlowProvider } from '@xyflow/react';

function useRoutesWithAuthElements(routes: RouteConfig[]) {
  const { user } = useAuth();

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
      ) as (keyof SystemPermissions)[];

      const userHasAllRequiredPermissions = requiredPermissions.every(
        (permission) => user.systemPermissions[permission] === true
      );

      if (!userHasAllRequiredPermissions) {
        return {
          ...route,
          element: <Unauthorized />,
        };
      }

      return route;
    });
  }, [routes, user]);

  return useMemo(
    () =>
      routesWithAuthElements.map((route: RouteConfig, index) => (
        <Route key={route.path} path={route.path} element={route.element} />
      )),
    [routesWithAuthElements]
  );
}

function AppLayout(props: PropsWithChildren) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { t } = useTranslations('app', { de, en });

  const { pullToRefreshIsEnabled } = usePtrStore();

  return (
    <PullToRefresh
      onRefresh={() => queryClient.invalidateQueries()}
      pullDownThreshold={90}
      refreshingContent={<Spinner />}
      pullingContent={
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '8px' }}>
          <div style={{ fontSize: '14px' }}>{t('pullToRefresh')}</div>
          <div style={{ fontSize: '24px' }}>↓</div>
        </div>
      }
      isPullable={pullToRefreshIsEnabled}
    >
      <HeroUIProvider navigate={navigate} labelPlacement="inside">
        <ToastProvider>
          <ReactFlowProvider>
            <Layout noLayout={!isAuthenticated}>{props.children}</Layout>
          </ReactFlowProvider>
        </ToastProvider>
      </HeroUIProvider>
    </PullToRefresh>
  );
}

function AppContent() {
  const { isAuthenticated } = useAuth();
  const allRoutes = useAllRoutes();
  const routesWithAuthElements = useRoutesWithAuthElements(allRoutes);

  return (
    <Routes>
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route
        path="/reset-password"
        element={
          <UnauthorizedLayout>
            <ResetPassword />
          </UnauthorizedLayout>
        }
      />

      {routesWithAuthElements}

      {!isAuthenticated && <Route path="*" element={<Unauthorized />} />}
    </Routes>
  );
}

export function App() {
  usePersistedAuth();
  // useRefreshSession();
  const { isInitialized } = useAuth();
  const { setTheme } = useTheme();

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

  return (
    <AppLayout>
      <PWAUpdatePrompt />
      {isInitialized ? <AppContent /> : <BootScreen />}
    </AppLayout>
  );
}

export default App;
