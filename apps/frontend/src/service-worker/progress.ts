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
  // Only this worker's own install is reported. Workbox also caches missing entries at fetch time in an
  // active worker; those writes are not an update download.
  let installing = false;
  let resolveTotal: (total: number) => void = () => undefined;
  const total = new Promise<number>((resolve) => (resolveTotal = resolve));

  addPlugins([
    {
      cacheDidUpdate: async () => {
        if (!installing) return;
        done += 1;
        // Progress waits for the total, so the first message is always (0, total) and progress never jumps back.
        const knownTotal = await total;
        await broadcast(Math.min(done, knownTotal), knownTotal);
      },
    },
  ]);

  self.addEventListener('install', (event) => {
    installing = true;
    event.waitUntil(
      (async () => {
        const count = await countEntriesToDownload(manifestUrls);
        await broadcast(0, count);
        resolveTotal(count);
      })(),
    );
  });
  self.addEventListener('activate', () => {
    installing = false;
  });
}
