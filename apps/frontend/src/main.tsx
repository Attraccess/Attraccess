import 'intl-pluralrules';
import { StrictMode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import * as ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './app/app';
import { RethrowRouteError } from './app/RethrowRouteError';
import '@attraccess/plugins-frontend-ui';
import { queryClient } from './api/queryClient';
import { PluginProvider } from './app/plugins/PluginProvider';
import { registerPwaUpdates } from './pwa-update/register';
import { registerInstallPrompt } from './pwa-install';
import { detectAndSetLanguage } from '@attraccess/plugins-frontend-ui';
import { trackVisualViewportHeight } from './viewport-height';
import { Providers } from '@attraccess/ui';

detectAndSetLanguage();
trackVisualViewportHeight();

registerInstallPrompt();
registerPwaUpdates();

// A data router, so pages can block navigation (useBlocker). One splat route keeps the app's own <Routes>.
const router = createBrowserRouter([
  {
    path: '*',
    element: (
      <PluginProvider>
        <StrictMode>
          <App />
        </StrictMode>
      </PluginProvider>
    ),
    errorElement: <RethrowRouteError />,
  },
]);

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <Providers>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </Providers>,
);
