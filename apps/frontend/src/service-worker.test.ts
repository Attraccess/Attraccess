// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  precache: vi.fn(),
  registerRoute: vi.fn(),
  notification: vi.fn(),
  skipWaiting: vi.fn(),
  matchAll: vi.fn(),
  openWindow: vi.fn(),
  addPlugins: vi.fn(),
}));
vi.mock('workbox-precaching', () => ({
  cleanupOutdatedCaches: vi.fn(),
  createHandlerBoundToURL: () => vi.fn(),
  addPlugins: state.addPlugins,
  getCacheKeyForURL: (url: string) => `https://example.test/${url}`,
}));
vi.mock('workbox-routing', () => ({ NavigationRoute: class {}, registerRoute: state.registerRoute }));
vi.mock('workbox-strategies', () => ({ CacheFirst: class {} }));
vi.mock('workbox-expiration', () => ({ ExpirationPlugin: class {} }));
vi.mock('workbox-core', () => ({ clientsClaim: vi.fn(), cacheNames: { precache: 'precache' } }));
vi.mock('./service-worker/caching', () => ({ setupPrecaching: state.precache }));
const handlers = new Map<string, Array<(event: unknown) => void>>();
// Every listener for the type runs, as in a real worker (several modules listen to `install`).
const fire = (type: string, event: unknown) => handlers.get(type)?.forEach((handler) => handler(event));
beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  handlers.clear();
  state.notification.mockResolvedValue(undefined);
  state.matchAll.mockResolvedValue([]);
  state.openWindow.mockResolvedValue(undefined);
  vi.stubGlobal('self', {
    __WB_MANIFEST: ['app.js', { url: 'icon.png', revision: '1' }],
    skipWaiting: state.skipWaiting,
    registration: { showNotification: state.notification },
    clients: { matchAll: state.matchAll, openWindow: state.openWindow },
    location: { href: 'https://example.test/' },
    addEventListener: (type: string, handler: (event: unknown) => void) =>
      handlers.set(type, [...(handlers.get(type) ?? []), handler]),
  });
  await import('./service-worker');
});
afterEach(() => vi.unstubAllGlobals());
it('precaches the navigation shell and only skips waiting on the skip-waiting message', () => {
  expect(state.precache).toHaveBeenCalledWith([
    'app.js',
    { url: 'icon.png', revision: '1' },
    { url: 'index.html', revision: null },
  ]);
  expect(state.skipWaiting).not.toHaveBeenCalled();
  fire('install', { waitUntil: vi.fn() });
  expect(state.skipWaiting).not.toHaveBeenCalled();
  fire('message', { data: {} });
  expect(state.skipWaiting).not.toHaveBeenCalled();
  fire('message', { data: { type: 'SKIP_WAITING' } });
  expect(state.skipWaiting).toHaveBeenCalledOnce();
});
it('skips waiting on its own only when it replaces a worker from before the update prompt', async () => {
  const cacheNamesPresent = new Set<string>();
  vi.stubGlobal('caches', {
    has: async (name: string) => cacheNamesPresent.has(name),
    open: async (name: string) => {
      cacheNamesPresent.add(name);
      return { keys: async () => [] };
    },
  });
  const install = async () => {
    const waitUntil = vi.fn();
    fire('install', { waitUntil });
    await Promise.all(waitUntil.mock.calls.map(([promise]) => promise));
  };
  (globalThis.self as unknown as { registration: object }).registration = { active: {} };

  // The active worker is a legacy one: its pages never send SKIP_WAITING.
  await install();
  expect(state.skipWaiting).toHaveBeenCalledOnce();

  // Activating leaves the marker; the next update waits for the page.
  const activated = vi.fn();
  fire('activate', { waitUntil: activated });
  await activated.mock.calls[0][0];
  await install();
  expect(state.skipWaiting).toHaveBeenCalledOnce();
});
it('does not report cache writes outside its own install', async () => {
  const postMessage = vi.fn();
  state.matchAll.mockResolvedValue([{ postMessage }]);
  const [{ cacheDidUpdate }] = state.addPlugins.mock.calls[0][0];
  // An active worker caches a missing precache entry at fetch time.
  await cacheDidUpdate();
  expect(postMessage).not.toHaveBeenCalled();
});
it('posts install and precache progress to all window clients', async () => {
  const postMessage = vi.fn();
  state.matchAll.mockResolvedValue([{ postMessage }]);
  vi.stubGlobal('caches', {
    open: async () => ({ keys: async () => [{ url: 'https://example.test/app.js' }] }),
  });
  const waitUntil = vi.fn();
  fire('install', { waitUntil });
  await waitUntil.mock.calls[0][0];
  expect(state.matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true });
  expect(postMessage).toHaveBeenLastCalledWith({ type: 'SW_UPDATE_PROGRESS', done: 0, total: 2 });

  const [{ cacheDidUpdate }] = state.addPlugins.mock.calls[0][0];
  await cacheDidUpdate();
  await cacheDidUpdate();
  await cacheDidUpdate();
  expect(postMessage).toHaveBeenLastCalledWith({ type: 'SW_UPDATE_PROGRESS', done: 2, total: 2 });
});
it('counts a manifest entry that is listed twice only once', async () => {
  vi.resetModules();
  (globalThis.self as unknown as { __WB_MANIFEST: unknown[] }).__WB_MANIFEST = [
    'app.js',
    { url: 'icon.png', revision: '1' },
    { url: 'icon.png', revision: '1' },
    { url: 'new.png', revision: '2' },
    { url: 'new.png', revision: '2' },
  ];
  await import('./service-worker');
  const postMessage = vi.fn();
  state.matchAll.mockResolvedValue([{ postMessage }]);
  vi.stubGlobal('caches', {
    open: async () => ({ keys: async () => [{ url: 'https://example.test/app.js' }] }),
  });
  const waitUntil = vi.fn();
  fire('install', { waitUntil });
  await waitUntil.mock.calls[0][0];
  // icon.png, new.png and the index.html shell are missing from the cache; app.js is already there.
  expect(postMessage).toHaveBeenLastCalledWith({ type: 'SW_UPDATE_PROGRESS', done: 0, total: 3 });
});
it('does not fail the install when posting progress throws', async () => {
  state.matchAll.mockRejectedValue(new Error('no clients'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const waitUntil = vi.fn();
  fire('install', { waitUntil });
  await expect(waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
});
it('shows structured push notifications with defaults and falls back to text for non-JSON payloads', () => {
  const waitUntil = vi.fn();
  fire('push', { waitUntil });
  expect(state.notification).not.toHaveBeenCalled();
  fire('push', {
    data: {
      json: () => ({
        title: 'Machine ready',
        body: 'Laser',
        icon: '/machine.png',
        tag: 'resource-7',
        url: '/resources/7',
      }),
    },
    waitUntil,
  });
  expect(state.notification).toHaveBeenCalledWith('Machine ready', {
    body: 'Laser',
    icon: '/machine.png',
    badge: '/badge-72.png',
    tag: 'resource-7',
    data: { url: '/resources/7' },
  });
  fire('push', {
    data: {
      json: () => {
        throw new Error('Not JSON');
      },
      text: () => 'Plain message',
    },
    waitUntil,
  });
  expect(state.notification).toHaveBeenLastCalledWith('Attraccess', {
    body: 'Plain message',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: undefined,
    data: { url: '/' },
  });
  expect(waitUntil).toHaveBeenCalledTimes(2);
});
it('focuses and navigates an existing client when a notification is clicked', async () => {
  const focus = vi.fn().mockResolvedValue(undefined);
  const navigate = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn();
  state.matchAll.mockResolvedValue([{ focus, navigate }]);
  let completed: Promise<unknown> | undefined;
  fire('notificationclick', {
    notification: { close, data: { url: '/resources/7' } },
    waitUntil: (promise: Promise<unknown>) => {
      completed = promise;
    },
  });
  await completed;
  expect(close).toHaveBeenCalledOnce();
  expect(focus).toHaveBeenCalledOnce();
  expect(navigate).toHaveBeenCalledWith('/resources/7');
  expect(state.openWindow).not.toHaveBeenCalled();
});
it('opens the app when no focusable window exists', async () => {
  let completed: Promise<unknown> | undefined;
  fire('notificationclick', {
    notification: { close: vi.fn() },
    waitUntil: (promise: Promise<unknown>) => {
      completed = promise;
    },
  });
  await completed;
  expect(state.openWindow).toHaveBeenCalledWith('/');
});
