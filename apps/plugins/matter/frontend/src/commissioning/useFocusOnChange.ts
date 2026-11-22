import { useEffect, useRef } from 'react';

/**
 * Moves the focus to the first heading (`h3`, rendered with `tabIndex={-1}`) inside the returned container whenever
 * `view` changes, so a screen reader announces the new step and the focus does not stay on a button that is gone. The
 * first view (after `null`, which means still loading) is left alone: opening the page keeps the focus where the person
 * put it. Used by CommissioningFlow (one view per step and outcome) and FinishStep (naming, then done).
 */
export function useFocusOnChange<T extends HTMLElement>(view: string | null) {
  const container = useRef<T>(null);
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (view === null || shown.current === view) return;
    const first = shown.current === null;
    shown.current = view;
    if (first) return;
    container.current?.querySelector<HTMLElement>('h3')?.focus();
  }, [view]);
  return container;
}
