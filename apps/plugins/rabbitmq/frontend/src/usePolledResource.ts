import { useCallback, useEffect, useRef, useState } from 'react';

export interface PolledResource<T> {
  data: T | null;
  // Message of the last failed load; the previous data stays available.
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

// Loads a resource on mount and then every `intervalMs`. Polling pauses while
// the tab is hidden (and reloads as soon as it is visible again) and stops for
// good on unmount, so a closed panel never keeps hitting the broker. A reload
// requested while a load is in flight runs once that load finishes, so a
// refresh after a change never returns the list from before it.
export function usePolledResource<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  fallbackError: string,
): PolledResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const latest = useRef({ fetcher, fallbackError });
  latest.current = { fetcher, fallbackError };
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const again = useRef(false);

  // A poll that finds a load in flight is skipped; an explicit reload is queued.
  const load = useCallback(async (queueIfBusy: boolean) => {
    if (inFlight.current) {
      if (queueIfBusy) again.current = true;
      return;
    }
    inFlight.current = true;
    setLoading(true);
    try {
      do {
        again.current = false;
        try {
          const result = await latest.current.fetcher();
          if (mounted.current) {
            setData(result);
            setError(null);
          }
        } catch (err) {
          if (mounted.current)
            setError(err instanceof Error && err.message ? err.message : latest.current.fallbackError);
        }
      } while (again.current && mounted.current);
    } finally {
      inFlight.current = false;
      again.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);
  const reload = useCallback(() => load(true), [load]);

  useEffect(() => {
    mounted.current = true;
    void load(false);
    const timer = setInterval(() => {
      if (!document.hidden) void load(false);
    }, intervalMs);
    const onVisible = () => {
      if (!document.hidden) void load(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs, load]);

  return { data, error, loading, reload };
}
