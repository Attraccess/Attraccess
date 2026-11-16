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
import { registerPwaUpdates } from './pwa-update/register';
import { detectAndSetLanguage } from '@attraccess/plugins-frontend-ui';
import { trackVisualViewportHeight } from './viewport-height';
import { Providers } from '@attraccess/ui';

detectAndSetLanguage();
trackVisualViewportHeight();

registerPwaUpdates();

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
