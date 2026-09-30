import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePushNotifications } from './usePushNotifications';

const upsertSubscription = vi.fn();

vi.mock('@attraccess/react-query-client', () => ({
  usePushServicePushGetVapidPublicKey: () => ({ data: { publicKey: 'AQID' }, isLoading: false }),
  usePushServicePushUpsertSubscription: () => ({ mutateAsync: upsertSubscription }),
  usePushServicePushDeleteSubscription: () => ({ mutateAsync: vi.fn() }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('usePushNotifications', () => {
  beforeEach(() => {
    vi.useRealTimers();
    upsertSubscription.mockReset();
    upsertSubscription.mockResolvedValue({ id: 1 });

    Object.defineProperty(window, 'atob', {
      configurable: true,
      value: (value: string) => Buffer.from(value, 'base64').toString('binary'),
    });

    Object.defineProperty(window, 'PushManager', { configurable: true, value: vi.fn() });
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for a pending service worker registration before subscribing', async () => {
    const subscription = {
      endpoint: 'https://push.example/subscription',
      toJSON: () => ({
        endpoint: 'https://push.example/subscription',
        keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
      }),
    };
    const registration = {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe: vi.fn().mockResolvedValue(subscription),
      },
    };

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue(null),
        ready: Promise.resolve(registration),
      },
    });

    const { result } = renderHook(() => usePushNotifications(), { wrapper });

    await act(async () => {
      await expect(result.current.subscribe()).resolves.toBe(true);
    });

    expect(registration.pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: expect.any(Uint8Array),
    });
    expect(upsertSubscription).toHaveBeenCalledWith({
      requestBody: {
        endpoint: 'https://push.example/subscription',
        keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
        userAgent: navigator.userAgent,
      },
    });
  });

  it('returns false instead of staying busy forever when no service worker becomes ready', async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue(null),
        ready: new Promise(() => undefined),
      },
    });

    const { result } = renderHook(() => usePushNotifications(), { wrapper });

    const subscribePromise = act(async () => result.current.subscribe());
    await vi.advanceTimersByTimeAsync(3000);
    const subscribed = await subscribePromise;

    expect(subscribed).toBe(false);
    expect(result.current.isBusy).toBe(false);
    expect(upsertSubscription).not.toHaveBeenCalled();
  });
  it('updates the mounted global hook only after account enrollment succeeds, and shares unsubscribe', async () => {
    const subscription = {
      endpoint: 'https://push.example/subscription',
      toJSON: () => ({
        endpoint: 'https://push.example/subscription',
        keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
      }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    };
    let browserSubscription: typeof subscription | null = null;
    const registration = {
      pushManager: {
        getSubscription: vi.fn(async () => browserSubscription),
        subscribe: vi.fn(async () => {
          browserSubscription = subscription;
          return subscription;
        }),
      },
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue(registration) },
    });
    const { result } = renderHook(
      () => ({
        global: usePushNotifications(),
        account: usePushNotifications(),
      }),
      { wrapper },
    );
    await act(async () => undefined);
    expect(result.current.global.permission).toBe('default');
    expect(result.current.global.isSubscribed).toBe(false);
    expect(upsertSubscription).not.toHaveBeenCalled();

    upsertSubscription.mockRejectedValueOnce(new Error('Server enrollment failed'));
    await act(async () => {
      await expect(result.current.account.subscribe()).rejects.toThrow('Server enrollment failed');
    });
    expect(result.current.global.isSubscribed).toBe(false);
    expect(result.current.global.permission).toBe('granted');
    expect(result.current.account.permission).toBe('granted');

    await act(async () => {
      await expect(result.current.account.subscribe()).resolves.toBe(true);
    });
    expect(result.current.global.permission).toBe('granted');
    expect(result.current.global.isSubscribed).toBe(true);
    expect(result.current.account.isSubscribed).toBe(true);
    expect(upsertSubscription).toHaveBeenCalledTimes(2);
    // Retrying enrollment reuses the browser subscription left by the failed upsert.
    expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.account.unsubscribe();
    });
    expect(result.current.global.isSubscribed).toBe(false);
    expect(result.current.account.isSubscribed).toBe(false);
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
  });
  it('does not let an older mount snapshot overwrite a successful enrollment', async () => {
    let resolveInitial: (value: null) => void = () => undefined;
    const initialSubscription = new Promise<null>((resolve) => {
      resolveInitial = resolve;
    });
    const subscription = {
      toJSON: () => ({ endpoint: 'https://push.example/subscription', keys: { p256dh: 'key', auth: 'secret' } }),
    };
    const registration = {
      pushManager: {
        getSubscription: vi
          .fn()
          .mockResolvedValue(null)
          .mockReturnValueOnce(initialSubscription)
          .mockReturnValueOnce(initialSubscription),
        subscribe: vi.fn().mockResolvedValue(subscription),
      },
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue(registration) },
    });
    const { result } = renderHook(() => ({ global: usePushNotifications(), account: usePushNotifications() }), {
      wrapper,
    });
    await act(async () => undefined);
    await act(async () => {
      await result.current.account.subscribe();
    });
    expect(result.current.global.isSubscribed).toBe(true);
    await act(async () => {
      resolveInitial(null);
    });
    expect(result.current.global.isSubscribed).toBe(true);
    expect(result.current.account.isSubscribed).toBe(true);
  });
  it.each(['denied', 'default'] as const)(
    'shares native %s permission without claiming enrollment',
    async (permission) => {
      const subscribe = vi.fn();
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          getRegistration: vi.fn().mockResolvedValue({
            pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe },
          }),
        },
      });
      vi.mocked(Notification.requestPermission).mockResolvedValue(permission);
      const { result } = renderHook(() => ({ global: usePushNotifications(), account: usePushNotifications() }), {
        wrapper,
      });
      await act(async () => undefined);
      expect(Notification.requestPermission).not.toHaveBeenCalled();
      await act(async () => {
        await expect(result.current.account.subscribe()).resolves.toBe(false);
      });
      expect(result.current.global.permission).toBe(permission);
      expect(result.current.account.permission).toBe(permission);
      expect(result.current.global.isSubscribed).toBe(false);
      expect(result.current.account.isSubscribed).toBe(false);
      expect(subscribe).not.toHaveBeenCalled();
      expect(upsertSubscription).not.toHaveBeenCalled();
      expect(Notification.requestPermission).toHaveBeenCalledTimes(1);
    },
  );
});
