import { useSyncExternalStore } from 'react';

// Tailwind's `md` breakpoint: where the flow editor docks panels beside the canvas.
const MD_QUERY = '(min-width: 768px)';

const canMatch = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

function subscribe(onChange: () => void): () => void {
  if (!canMatch()) return () => undefined;
  const mql = window.matchMedia(MD_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

export function useMdUp(): boolean {
  return useSyncExternalStore(subscribe, () => (canMatch() ? window.matchMedia(MD_QUERY).matches : true));
}
