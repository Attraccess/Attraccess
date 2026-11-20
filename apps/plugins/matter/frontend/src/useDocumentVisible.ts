import { useSyncExternalStore } from 'react';

const subscribe = (listener: () => void) => {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
};

/**
 * Whether the browser tab is visible. Polls pause while it is hidden (a forgotten background tab sends nothing) and
 * load once when it becomes visible again.
 */
export function useDocumentVisible(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.visibilityState !== 'hidden',
    () => true,
  );
}
