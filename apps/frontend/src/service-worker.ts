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
const precacheManifest = [...wb_manifest];

const ensurePrecached = (url: string) => {
  const alreadyIncluded = precacheManifest.some((entry) => {
    if (typeof entry === 'string') {
      return entry === url;
    }

    return entry.url === url;
  });

  if (!alreadyIncluded) {
    precacheManifest.push({ url, revision: null });
  }
};

ensurePrecached('index.html');
setupPrecaching(precacheManifest);

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
  }),
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
  }),
);

// Web Push: show incoming pushes as notifications.
// Payload shape (see api PushNotificationPayload): { title, body, url?, tag?, icon? }
interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  icon?: string;
}

self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    payload = { body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Attraccess', {
      body: payload.body,
      icon: payload.icon ?? '/icon-192.png',
      badge: '/badge-72.png',
      tag: payload.tag,
      data: { url: payload.url ?? '/' },
    }),
  );
});

// Clicking a notification focuses an existing app window (and navigates it) or opens a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/';

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      const existingClient = windowClients.find((client) => 'focus' in client);
      if (existingClient) {
        await existingClient.focus();
        if ('navigate' in existingClient) {
          await existingClient.navigate(url);
        }
        return;
      }

      await self.clients.openWindow(url);
    })(),
  );
});
