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

// Workbox skips entries whose cache key (url + revision) is already cached, and downloads each cache key
// once even when the manifest lists it twice (includeAssets overlaps the glob). Mirror both to get a total
// that matches the real work.
async function countEntriesToDownload(urls: string[]): Promise<number> {
  try {
    const cache = await caches.open(cacheNames.precache);
    const cached = new Set((await cache.keys()).map((request) => request.url));
    const pending = new Set<string>();
    urls.forEach((url) => {
      const key = getCacheKeyForURL(url);
      const cacheUrl = key ? new URL(key, self.location.href).href : url;
      if (!cached.has(cacheUrl)) pending.add(cacheUrl);
    });
    return pending.size;
  } catch {
    return new Set(urls).size;
  }
}

export function setupUpdateProgress(manifestUrls: string[]) {
  let done = 0;
  let total = new Set(manifestUrls).size;

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
