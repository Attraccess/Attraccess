import 'intl-pluralrules';
import { StrictMode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import * as ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './app/app';
import '@attraccess/plugins-frontend-ui';
import { queryClient } from './api/queryClient';
import { PluginProvider } from './app/plugins/plugin-provider';
import { PWAInstall } from './components/pwaInstall';
import { registerSW } from 'virtual:pwa-register';
import { detectAndSetLanguage } from '@attraccess/plugins-frontend-ui';
import { trackVisualViewportHeight } from './viewport-height';
import { Providers } from '@attraccess/ui';

detectAndSetLanguage();
trackVisualViewportHeight();

const oneMinute = 60 * 1000;
const serviceWorkerUpdateIntervalMs = 15 * oneMinute;

const updateSW = registerSW({
  immediate: true,
  onRegistered(registration) {
    if (import.meta.env.PROD && registration) {
      setInterval(() => {
        registration.update();
      }, serviceWorkerUpdateIntervalMs);
    }
  },
  onNeedRefresh() {
    if (import.meta.env.PROD) {
      updateSW(true);
    }
  },
});

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

// Throwaway WAGO design review. This branch is removed by production builds.
if (import.meta.env.DEV && new URLSearchParams(location.search).get('prototype') === 'wago-configuration') {
  void import('../../plugins/wago/frontend/src/configuration-prototype/ConfigurationPrototype').then(
    ({ ConfigurationPrototype }) => {
      root.render(
        <BrowserRouter>
          <ConfigurationPrototype />
        </BrowserRouter>,
      );
    },
  );
} else
  root.render(
    <Providers>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <PluginProvider>
            <StrictMode>
              <PWAInstall />
              <App />
            </StrictMode>
          </PluginProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </Providers>,
  );
