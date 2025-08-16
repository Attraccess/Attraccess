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

const oneMinute = 60 * 1000;
const intervalMS = 15 * oneMinute;

// auto update SW and reload immediately when a new version is available
const updateSW = registerSW({
  immediate: true,
  onRegistered(r) {
    r &&
      setInterval(() => {
        r.update();
      }, intervalMS);
  },
  onNeedRefresh() {
    updateSW(true);
  },
});

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
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
);
