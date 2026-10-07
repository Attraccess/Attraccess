import { TwoFactorGate } from './two-factor-gate';
import { KioskGuard } from './kiosk/KioskGuard';
import { useNavigate } from 'react-router-dom';
import { PropsWithChildren } from 'react';
import { useAuth } from '../hooks/useAuth';
import { ToastProvider } from '../components/toastProvider';
import { I18nProvider } from '@heroui/react';
import { RouterProvider } from '@heroui/react';
import { Spinner } from '@heroui/react';
import PullToRefresh from 'react-simple-pull-to-refresh';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './app.de.json';
import en from './app.en.json';
import { usePtrStore } from '../stores/ptr.store';
import { ReactFlowProvider } from '@xyflow/react';
import { AttraccessUserActionsBridge } from '../components/attraccessUserActionsBridge';
import { SupervisorApprovalListener } from '../components/supervisorApproval/SupervisorApprovalListener';
import { ThemeToggle } from '../components/themeToggle';
import { SessionBillingSummary } from './billing/sessionSummary';
import { useIsTouchDevice } from './app.use-is-touch-device.helpers';
import { Outlet } from 'react-router-dom';
import { Route } from 'react-router-dom';
import { Routes } from 'react-router-dom';
import { useMemo } from 'react';
import { Layout } from './layout/layout';
import { useAllRoutes } from './routes';
import { VerifyEmail } from './verify-email';
import { ResetPassword } from './reset-password/resetPassword';
import { UnauthorizedLayout } from './unauthorized/unauthorized-layout/layout';
import { AcceptInvitation } from './accept-invitation';
import { NotFound } from './not-found';
import { useRoutesWithAuthElements } from './app.use-is-touch-device.helpers';
import { BootScreen } from '../components/bootScreen';
import { configureApiClient } from '../api';
import { useLocaleSync } from '../hooks/useLocaleSync';

// Exported for notFound.spec.tsx, which drives the real route table (catch-all included).
export function AppRoutes() {
  const { isAuthenticated } = useAuth();
  const allRoutes = useAllRoutes();

  const bareRoutes = useMemo(() => allRoutes.filter((r) => r.noLayout), [allRoutes]);
  const layoutRoutes = useMemo(() => allRoutes.filter((r) => !r.noLayout), [allRoutes]);

  const bareRouteElements = useRoutesWithAuthElements(bareRoutes);
  const layoutRouteElements = useRoutesWithAuthElements(layoutRoutes);

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

export function AppContent() {
  return (
    <TwoFactorGate>
      <KioskGuard />
      <AppRoutes />
    </TwoFactorGate>
  );
}

export function AppLayout(props: PropsWithChildren) {
  const { isAuthenticated, needsTwoFactorSetup, user } = useAuth();
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
          {(!isAuthenticated || needsTwoFactorSetup) && (
            <div className="fixed top-4 right-4 z-30">
              <ThemeToggle />
            </div>
          )}
          <ReactFlowProvider>
            <AttraccessUserActionsBridge>
              {props.children}
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

export function App() {
  const { isInitialized } = useAuth();
  useLocaleSync();

  configureApiClient();

  return <AppLayout>{isInitialized ? <AppContent /> : <BootScreen />}</AppLayout>;
}
