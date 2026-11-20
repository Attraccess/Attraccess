import { useCallback, useEffect, useRef, useState } from 'react';

export interface MatterResource<T> {
  data: T | null;
  /** The message of the last failed load; cleared by the next success. `data` keeps the last good value. */
  error: string | null;
  /** True until the first load finished. A refetch does not set it again. */
  loading: boolean;
  /** Loads again. Resolves with the data (or null on failure). Only the newest request may update the state. */
  refetch: () => Promise<T | null>;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * One REST read with its own loading and error state, so a failing request blanks nothing but its own section. It
 * loads when `enabled` (permissions known and granted: a request the API would answer with 403 is never sent) and
 * whenever `load` changes; wrap `load` in `useCallback`. The last good data stays while a refetch fails.
 */
export function useMatterResource<T>(load: () => Promise<T>, enabled = true): MatterResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const sequence = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    const mine = ++sequence.current;
    try {
      const next = await load();
      if (!mounted.current || mine !== sequence.current) return next;
      setData(next);
      setError(null);
      return next;
    } catch (failure) {
      if (mounted.current && mine === sequence.current) setError(messageOf(failure));
      return null;
    } finally {
      if (mounted.current && mine === sequence.current) setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    if (!enabled) {
      sequence.current += 1;
      setLoading(false);
      return;
    }
    setLoading(true);
    void refetch();
  }, [enabled, refetch]);

  return { data, error, loading, refetch };
}
