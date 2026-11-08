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
// good on unmount, so a closed panel never keeps hitting the broker.
export function usePolledResource<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  fallbackError: string,
  enabled = true,
): PolledResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const latest = useRef({ fetcher, fallbackError });
  latest.current = { fetcher, fallbackError };
  const mounted = useRef(true);
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const result = await latest.current.fetcher();
      if (mounted.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (mounted.current) setError(err instanceof Error && err.message ? err.message : latest.current.fallbackError);
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) return;
    void reload();
    const timer = setInterval(() => {
      if (!document.hidden) void reload();
    }, intervalMs);
    const onVisible = () => {
      if (!document.hidden) void reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, intervalMs, reload]);

  return { data, error, loading, reload };
}
