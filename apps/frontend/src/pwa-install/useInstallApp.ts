import { isIosSafari, isStandalone, promptInstall, useInstallPromptStore } from './installPrompt';

/**
 * How this browser can install Attraccess right now:
 * - 'prompt': Chrome handed us its install prompt;
 * - 'ios': Safari on iOS has no prompt API, so we explain Share → Add to Home Screen;
 * - null: already installed, or the browser offers no way we can trigger (Firefox, Chrome before its heuristics fire).
 */
export type InstallMode = 'prompt' | 'ios' | null;

export function useInstallApp() {
  const hasPrompt = useInstallPromptStore((state) => state.deferredPrompt !== null);
  const setIosHelpOpen = useInstallPromptStore((state) => state.setIosHelpOpen);

  const mode: InstallMode = isStandalone() ? null : hasPrompt ? 'prompt' : isIosSafari() ? 'ios' : null;

  const install = () => {
    if (mode === 'prompt') void promptInstall();
    else if (mode === 'ios') setIosHelpOpen(true);
  };

  return { mode, install };
}
