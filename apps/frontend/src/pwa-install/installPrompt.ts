import { create } from 'zustand';

// Chromium only and not in lib.dom, so typed here.
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const BANNER_DISMISSED_KEY = 'pwa-install-banner-dismissed-at';
// After "Not now" the banner stays away this long; the on-demand action stays available.
const BANNER_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

export function readBannerDismissed(): boolean {
  try {
    const dismissedAt = Number(localStorage.getItem(BANNER_DISMISSED_KEY));
    return dismissedAt > 0 && Date.now() - dismissedAt < BANNER_SNOOZE_MS;
  } catch {
    return false;
  }
}

interface InstallPromptState {
  /** The event Chrome handed us instead of showing its own install UI. It can be used for one prompt only. */
  deferredPrompt: BeforeInstallPromptEvent | null;
  isIosHelpOpen: boolean;
  isBannerDismissed: boolean;
  setIosHelpOpen: (open: boolean) => void;
  dismissBanner: () => void;
}

export const useInstallPromptStore = create<InstallPromptState>((set) => ({
  deferredPrompt: null,
  isIosHelpOpen: false,
  isBannerDismissed: readBannerDismissed(),
  setIosHelpOpen: (isIosHelpOpen) => set({ isIosHelpOpen }),
  dismissBanner: () => {
    try {
      localStorage.setItem(BANNER_DISMISSED_KEY, String(Date.now()));
    } catch {
      // Without storage the banner stays dismissed until the next page load.
    }
    set({ isBannerDismissed: true });
  },
}));

/**
 * Takes over Chrome's install prompt. Call before React mounts: the event can fire before any component exists.
 * Returns a cleanup for tests.
 */
export function registerInstallPrompt(target: Window = window): () => void {
  const onBeforeInstallPrompt = (event: Event) => {
    // Stops Chrome's own mini-infobar / install pop-up; Attraccess offers the prompt on demand instead.
    event.preventDefault();
    useInstallPromptStore.setState({ deferredPrompt: event as BeforeInstallPromptEvent });
  };
  const onAppInstalled = () => useInstallPromptStore.setState({ deferredPrompt: null });

  target.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  target.addEventListener('appinstalled', onAppInstalled);
  return () => {
    target.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    target.removeEventListener('appinstalled', onAppInstalled);
  };
}

/** Opens Chrome's install dialog. The event is spent either way; Chrome fires a new one if it can be offered again. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | null> {
  const event = useInstallPromptStore.getState().deferredPrompt;
  if (!event) return null;
  useInstallPromptStore.setState({ deferredPrompt: null });
  try {
    await event.prompt();
    return (await event.userChoice).outcome;
  } catch {
    return null;
  }
}

export function isStandalone(): boolean {
  const displayModeStandalone =
    typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  return displayModeStandalone || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// iPadOS reports itself as a Mac; touch points tell them apart.
export function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}
