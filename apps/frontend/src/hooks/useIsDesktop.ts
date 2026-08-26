import { useSyncExternalStore } from 'react';

/** Tailwind's `sm` breakpoint. The settings shell switches between a rail and a list here. */
const DESKTOP_QUERY = '(min-width: 640px)';

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/**
 * Whether the viewport is at least `sm` wide, read synchronously on the first render.
 *
 * This decides *routing* — `/settings` redirects on desktop and lists sections on a phone — so it
 * cannot be a CSS class, and it cannot settle in an effect either: a state-in-effect version
 * flashes the phone list for one frame before redirecting.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP_QUERY).matches);
}
