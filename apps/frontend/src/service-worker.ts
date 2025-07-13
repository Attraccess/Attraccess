import { createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { setupPrecaching } from './service-worker/caching';

declare let self: ServiceWorkerGlobalScope;

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

const wb_manifest = self.__WB_MANIFEST;
setupPrecaching(wb_manifest);

// Only handle navigation requests that aren't for API routes
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\/.*$/, /^\/docs\/.*$/, /^\/cdn\/.*$/, /^\/_attractap_assets\/.*$/],
  })
);
