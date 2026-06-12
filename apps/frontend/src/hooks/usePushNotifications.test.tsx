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
});
