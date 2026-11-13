import { useCallback, useEffect, useRef, useState } from 'react';
import { getFabricStatus, type FabricBackupStatus } from './api';

export const FABRIC_POLL_MS = 10_000;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Loads and polls the fabric & backup status. The status never contains the recovery key (the key only travels in
 * the one-off reveal response, which callers keep in component state), so holding it here is safe.
 */
export function useFabricBackup() {
  const [status, setStatusState] = useState<FabricBackupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const next = await getFabricStatus();
      if (!mounted.current || mine !== seq.current) return;
      setStatusState(next);
      setError(null);
    } catch (caught) {
      if (mounted.current && mine === seq.current) setError(messageOf(caught));
    }
  }, []);

  /** Adopts a status that an action already returned. */
  const setStatus = useCallback((next: FabricBackupStatus) => {
    seq.current += 1;
    setStatusState(next);
    setError(null);
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh().finally(() => mounted.current && setLoading(false));
    const timer = setInterval(() => void refresh(), FABRIC_POLL_MS);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  return { status, error, loading, refresh, setStatus };
}
