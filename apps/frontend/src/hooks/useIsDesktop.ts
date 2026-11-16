import { useCallback, useSyncExternalStore } from 'react';

/** Tailwind's `sm` breakpoint. The settings shell switches between a rail and a list here. */
const DESKTOP_QUERY = '(min-width: 640px)';

// Test environments may run without matchMedia.
const canMatch = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/**
 * Whether a media query matches, read synchronously on the first render and kept up to date.
 * Without `matchMedia` (some test environments) it reports `fallback`.
 */
export function useMediaQuery(query: string, fallback = true): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!canMatch()) return () => undefined;
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => (canMatch() ? window.matchMedia(query).matches : fallback));
}

/** Whether the viewport is at least `px` wide, e.g. 1024 for Tailwind's `lg`. */
export function useMinWidth(px: number): boolean {
  return useMediaQuery(`(min-width: ${px}px)`);
}

/**
 * Whether the viewport is at least `sm` wide, read synchronously on the first render.
 *
 * This decides *routing* — `/settings` redirects on desktop and lists sections on a phone — so it
 * cannot be a CSS class, and it cannot settle in an effect either: a state-in-effect version
 * flashes the phone list for one frame before redirecting.
 */
export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY);
}
