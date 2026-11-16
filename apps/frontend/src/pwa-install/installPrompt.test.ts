import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  promptInstall,
  readBannerDismissed,
  registerInstallPrompt,
  useInstallPromptStore,
  type BeforeInstallPromptEvent,
} from './installPrompt';
import { useInstallApp } from './useInstallApp';

function installPromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent;
  Object.assign(event, {
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  });
  return event;
}

function mockDisplayMode(standalone: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) => ({ matches: standalone && query === '(display-mode: standalone)', media: query }) as MediaQueryList,
  );
}

const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const DAY_MS = 24 * 60 * 60 * 1000;

let unregister: () => void = () => undefined;

beforeEach(() => {
  useInstallPromptStore.setState({ deferredPrompt: null, isIosHelpOpen: false, isBannerDismissed: false });
  mockDisplayMode(false);
  unregister = registerInstallPrompt();
});

afterEach(() => {
  unregister();
  delete window.__attraccessInstallPrompt;
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('registerInstallPrompt', () => {
  it("suppresses Chrome's own install UI and keeps the event for later", () => {
    const event = installPromptEvent();
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(useInstallPromptStore.getState().deferredPrompt).toBe(event);
  });

  it('takes over an event that index.html caught before the app started', () => {
    unregister();
    const event = installPromptEvent();
    window.__attraccessInstallPrompt = event;
    unregister = registerInstallPrompt();

    expect(useInstallPromptStore.getState().deferredPrompt).toBe(event);
    expect(window.__attraccessInstallPrompt).toBeNull();
  });

  it('forgets the event once the app is installed', () => {
    window.dispatchEvent(installPromptEvent());
    window.dispatchEvent(new Event('appinstalled'));

    expect(useInstallPromptStore.getState().deferredPrompt).toBeNull();
  });

  it('stops listening after cleanup', () => {
    unregister();
    window.dispatchEvent(installPromptEvent());

    expect(useInstallPromptStore.getState().deferredPrompt).toBeNull();
  });
});

describe('promptInstall', () => {
  it.each(['accepted', 'dismissed'] as const)(
    'shows the prompt once and discards the event when %s',
    async (outcome) => {
      const event = installPromptEvent(outcome);
      window.dispatchEvent(event);

      await expect(promptInstall()).resolves.toBe(outcome);
      expect(event.prompt).toHaveBeenCalledOnce();
      expect(useInstallPromptStore.getState().deferredPrompt).toBeNull();
      await expect(promptInstall()).resolves.toBeNull();
    },
  );

  it('discards the event when the browser refuses to prompt', async () => {
    const event = installPromptEvent();
    vi.mocked(event.prompt).mockRejectedValue(new DOMException('already used'));
    window.dispatchEvent(event);

    await expect(promptInstall()).resolves.toBeNull();
    expect(useInstallPromptStore.getState().deferredPrompt).toBeNull();
  });
});

describe('useInstallApp', () => {
  it('offers nothing without a stored prompt on browsers other than iOS', () => {
    const { result } = renderHook(() => useInstallApp());
    expect(result.current.mode).toBeNull();
  });

  it('offers the prompt once Chrome provides one, and hides it again after use', async () => {
    const event = installPromptEvent();
    const { result } = renderHook(() => useInstallApp());

    act(() => {
      window.dispatchEvent(event);
    });
    expect(result.current.mode).toBe('prompt');

    await act(async () => result.current.install());
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(result.current.mode).toBeNull();
  });

  it('offers nothing when already running as an installed app', () => {
    mockDisplayMode(true);
    window.dispatchEvent(installPromptEvent());

    const { result } = renderHook(() => useInstallApp());
    expect(result.current.mode).toBeNull();
  });

  it('opens the Add to Home Screen help on iOS, which has no prompt API', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IOS_SAFARI);
    const { result } = renderHook(() => useInstallApp());

    expect(result.current.mode).toBe('ios');
    act(() => result.current.install());
    expect(useInstallPromptStore.getState().isIosHelpOpen).toBe(true);
  });

  it.each([
    [
      'Chrome',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1',
    ],
    [
      'an in-app browser',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0',
    ],
  ])('offers no Safari steps in %s on iOS', (_, userAgent) => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    const { result } = renderHook(() => useInstallApp());
    expect(result.current.mode).toBeNull();
  });

  it('recognises iPadOS, which reports itself as a Mac', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    );
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(5);
    const { result } = renderHook(() => useInstallApp());
    expect(result.current.mode).toBe('ios');
  });

  it('treats a home-screen launch on iOS as installed', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IOS_SAFARI);
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    try {
      const { result } = renderHook(() => useInstallApp());
      expect(result.current.mode).toBeNull();
    } finally {
      delete (navigator as Navigator & { standalone?: boolean }).standalone;
    }
  });
});

describe('banner snooze', () => {
  it('remembers "Not now" in local storage', () => {
    useInstallPromptStore.getState().dismissBanner();

    expect(useInstallPromptStore.getState().isBannerDismissed).toBe(true);
    expect(readBannerDismissed()).toBe(true);
  });

  it.each([
    [29, true],
    [31, false],
    [-1, false],
  ])('treats a dismissal %i days ago as snoozed=%s', (daysAgo, snoozed) => {
    localStorage.setItem('pwa-install-banner-dismissed-at', String(Date.now() - daysAgo * DAY_MS));
    expect(readBannerDismissed()).toBe(snoozed);
  });

  it('keeps working when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(readBannerDismissed()).toBe(false);
    useInstallPromptStore.getState().dismissBanner();
    expect(useInstallPromptStore.getState().isBannerDismissed).toBe(true);
  });
});
