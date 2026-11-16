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

let unregister: () => void = () => undefined;

beforeEach(() => {
  useInstallPromptStore.setState({ deferredPrompt: null, isIosHelpOpen: false, isBannerDismissed: false });
  mockDisplayMode(false);
  unregister = registerInstallPrompt();
});

afterEach(() => {
  unregister();
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
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
    const { result } = renderHook(() => useInstallApp());

    expect(result.current.mode).toBe('ios');
    act(() => result.current.install());
    expect(useInstallPromptStore.getState().isIosHelpOpen).toBe(true);
  });

  it('treats a home-screen launch on iOS as installed', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
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

  it('brings the banner back after 30 days', () => {
    localStorage.setItem('pwa-install-banner-dismissed-at', String(Date.now() - 31 * 24 * 60 * 60 * 1000));
    expect(readBannerDismissed()).toBe(false);
  });
});
