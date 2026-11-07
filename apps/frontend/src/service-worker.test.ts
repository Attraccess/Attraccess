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
const handlers = new Map<string, (event: unknown) => void>();
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
    addEventListener: (type: string, handler: (event: unknown) => void) => handlers.set(type, handler),
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
  handlers.get('message')?.({ data: {} });
  expect(state.skipWaiting).not.toHaveBeenCalled();
  handlers.get('message')?.({ data: { type: 'SKIP_WAITING' } });
  expect(state.skipWaiting).toHaveBeenCalledOnce();
});
it('posts install and precache progress to all window clients', async () => {
  const postMessage = vi.fn();
  state.matchAll.mockResolvedValue([{ postMessage }]);
  vi.stubGlobal('caches', {
    open: async () => ({ keys: async () => [{ url: 'https://example.test/app.js' }] }),
  });
  const waitUntil = vi.fn();
  handlers.get('install')?.({ waitUntil });
  await waitUntil.mock.calls[0][0];
  expect(state.matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true });
  expect(postMessage).toHaveBeenLastCalledWith({ type: 'SW_UPDATE_PROGRESS', done: 0, total: 2 });

  const [{ cacheDidUpdate }] = state.addPlugins.mock.calls[0][0];
  await cacheDidUpdate();
  await cacheDidUpdate();
  await cacheDidUpdate();
  expect(postMessage).toHaveBeenLastCalledWith({ type: 'SW_UPDATE_PROGRESS', done: 2, total: 2 });
});
it('does not fail the install when posting progress throws', async () => {
  state.matchAll.mockRejectedValue(new Error('no clients'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const waitUntil = vi.fn();
  handlers.get('install')?.({ waitUntil });
  await expect(waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
});
it('shows structured push notifications with defaults and falls back to text for non-JSON payloads', () => {
  const waitUntil = vi.fn();
  handlers.get('push')?.({ waitUntil });
  expect(state.notification).not.toHaveBeenCalled();
  handlers.get('push')?.({
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
  handlers.get('push')?.({
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
  handlers.get('notificationclick')?.({
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
  handlers.get('notificationclick')?.({
    notification: { close: vi.fn() },
    waitUntil: (promise: Promise<unknown>) => {
      completed = promise;
    },
  });
  await completed;
  expect(state.openWindow).toHaveBeenCalledWith('/');
});
