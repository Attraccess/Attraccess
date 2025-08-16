import { cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { setupPrecaching } from './service-worker/caching';
import { clientsClaim } from 'workbox-core';

declare let self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

const wb_manifest = self.__WB_MANIFEST;
setupPrecaching([...wb_manifest]);

// Cache-first strategy for CDN assets under /cdn/
registerRoute(
  ({ url }) => url.pathname.startsWith('/cdn/'),
  new CacheFirst({
    cacheName: 'cdn-assets',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 500,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// Only handle navigation requests that aren't for API routes
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [
      /^\/api\/.*$/,
      /^\/api$/,
      /^\/docs\/.*$/,
      /^\/docs$/,
      /^\/cdn\/.*$/,
      /^\/_attractap_assets\/.*$/,
      /^\/_attractap_assets$/,
    ],
  })
);
