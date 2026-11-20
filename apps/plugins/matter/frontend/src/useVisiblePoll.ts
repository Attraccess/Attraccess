import { useEffect, useRef } from 'react';
import { useDocumentVisible } from './useDocumentVisible';

/**
 * Calls `poll` every `intervalMs` while `enabled` and the browser tab is visible, and once when the tab becomes
 * visible again. The first load is the caller's (it happens on mount); this only keeps the data fresh.
 */
export function useVisiblePoll(poll: () => unknown, intervalMs: number, enabled: boolean): void {
  const visible = useDocumentVisible();
  const latest = useRef(poll);
  latest.current = poll;
  const hidden = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (!visible) {
      hidden.current = true;
      return;
    }
    if (hidden.current) void latest.current();
    hidden.current = false;
    const timer = setInterval(() => void latest.current(), intervalMs);
    return () => clearInterval(timer);
  }, [enabled, visible, intervalMs]);
}
