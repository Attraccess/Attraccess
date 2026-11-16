import { useCallback, useEffect, useRef, useState } from 'react';
import { getFabricStatus, type FabricBackupStatus } from './api';

export const FABRIC_POLL_MS = 10_000;
/** The longest pause between polls while the status keeps failing. */
export const FABRIC_POLL_MAX_BACKOFF_MS = 5 * 60_000;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** How long to wait before the next poll after `failures` failed polls in a row: doubling, capped. */
export const pollBackoffMs = (failures: number) =>
  failures === 0 ? 0 : Math.min(FABRIC_POLL_MS * 2 ** failures, FABRIC_POLL_MAX_BACKOFF_MS);

/**
 * Loads and polls the fabric & backup status. It does not poll while the page is hidden (it refreshes as soon as
 * it is shown again) and backs off while the status keeps failing. The status never contains the recovery key (the
 * key only travels in the one-off reveal response, which callers keep in component state), so holding it is safe.
 */
export function useFabricBackup() {
  const [status, setStatusState] = useState<FabricBackupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  const seq = useRef(0);

  /** Resolves to whether the status could be loaded. */
  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const next = await getFabricStatus();
      if (mounted.current && mine === seq.current) {
        setStatusState(next);
        setError(null);
      }
      return true;
    } catch (caught) {
      if (mounted.current && mine === seq.current) setError(messageOf(caught));
      return false;
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
    let failures = 0;
    let notBefore = 0;
    const poll = async () => {
      failures = (await refresh()) ? 0 : failures + 1;
      notBefore = Date.now() + pollBackoffMs(failures);
    };
    const tick = () => {
      if (!document.hidden && Date.now() >= notBefore) void poll();
    };
    const onVisibility = () => {
      if (!document.hidden) void poll();
    };
    void poll().finally(() => mounted.current && setLoading(false));
    const timer = setInterval(tick, FABRIC_POLL_MS);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  return { status, error, loading, refresh, setStatus };
}
