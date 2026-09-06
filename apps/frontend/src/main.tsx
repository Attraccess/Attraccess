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
