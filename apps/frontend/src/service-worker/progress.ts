import { addPlugins, getCacheKeyForURL } from 'workbox-precaching';
import { cacheNames } from 'workbox-core';

declare let self: ServiceWorkerGlobalScope;

export const SW_UPDATE_PROGRESS = 'SW_UPDATE_PROGRESS';

async function broadcast(done: number, total: number) {
  try {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((client) => client.postMessage({ type: SW_UPDATE_PROGRESS, done, total }));
  } catch (error) {
    // Progress is cosmetic and must never break the install.
    console.warn('Could not report service worker update progress', error);
  }
}

// Workbox skips entries whose cache key (url + revision) is already cached, so only the
// remaining ones are downloaded. Mirror that check to get a total that matches the real work.
async function countEntriesToDownload(urls: string[]): Promise<number> {
  try {
    const cache = await caches.open(cacheNames.precache);
    const cached = new Set((await cache.keys()).map((request) => request.url));
    return urls.filter((url) => {
      const key = getCacheKeyForURL(url);
      return !key || !cached.has(new URL(key, self.location.href).href);
    }).length;
  } catch {
    return urls.length;
  }
}

export function setupUpdateProgress(manifestUrls: string[]) {
  let done = 0;
  let total = manifestUrls.length;

  addPlugins([
    {
      cacheDidUpdate: async () => {
        done += 1;
        await broadcast(Math.min(done, total), total);
      },
    },
  ]);

  self.addEventListener('install', (event) => {
    event.waitUntil(
      (async () => {
        total = await countEntriesToDownload(manifestUrls);
        await broadcast(0, total);
        if (total === 0) {
          await broadcast(0, 0);
        }
      })(),
    );
  });
}
