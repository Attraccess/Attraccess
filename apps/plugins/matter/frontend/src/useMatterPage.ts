import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatterPermissions } from './permissions';
import {
  getSettings,
  getStatus,
  reconnect,
  removeSettings,
  saveSettings,
  type ConnectionSettings,
  type ConnectionStatus,
  type SettingsInput,
} from './api';

/** How often the open page refreshes the connection status. */
export const STATUS_POLL_MS = 5_000;

/** A request still pending after this long counts as failed, so one hung request cannot stop the polling. */
export const REQUEST_TIMEOUT_MS = 2 * STATUS_POLL_MS;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

function withTimeout<T>(request: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The request timed out.')), REQUEST_TIMEOUT_MS);
    request.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/**
 * Loads the settings and polls the status while the page is open. Saving and removing refresh both. The settings are
 * polled with the status, so a change another administrator saved reaches the open form (see SettingsForm), and a
 * first load that failed (API briefly down) is retried without a manual reload.
 *
 * A poll tick is skipped while an earlier request is still pending, so a hanging API does not pile up requests, and
 * only the newest status request may update the page, so a late answer never overwrites a newer one.
 *
 * Nothing is requested that the API would refuse: the status needs `canRead`, the settings need `canManage`. Until the
 * host has pushed the auth state (`known`), nothing is requested and the page keeps loading.
 */
export function useMatterPage({ known, canRead, canManage }: MatterPermissions) {
  const [settings, setSettings] = useState<ConnectionSettings | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  const statusSeq = useRef(0);
  const statusPending = useRef(0);
  const settingsPending = useRef(false);

  const refreshStatus = useCallback(async () => {
    const seq = ++statusSeq.current;
    statusPending.current += 1;
    try {
      const next = await withTimeout(getStatus());
      if (!mounted.current || seq !== statusSeq.current) return;
      setStatus(next);
      setStatusError(null);
    } catch (error) {
      if (mounted.current && seq === statusSeq.current) setStatusError(messageOf(error));
    } finally {
      statusPending.current -= 1;
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    settingsPending.current = true;
    try {
      const next = await withTimeout(getSettings());
      if (!mounted.current) return;
      setSettings(next);
      setSettingsError(null);
    } catch (error) {
      if (mounted.current) setSettingsError(messageOf(error));
    } finally {
      settingsPending.current = false;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!known) return;
    // Per run: when the permissions change, the previous run's late answer must not end the new run's loading.
    let cancelled = false;
    setLoading(canRead || canManage);
    void Promise.all([canManage && refreshSettings(), canRead && refreshStatus()]).finally(
      () => !cancelled && setLoading(false),
    );
    const timer = setInterval(() => {
      if (canRead && statusPending.current === 0) void refreshStatus();
      if (canManage && !settingsPending.current) void refreshSettings();
    }, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [known, canRead, canManage, refreshSettings, refreshStatus]);

  const save = useCallback(
    async (input: SettingsInput) => {
      const saved = await saveSettings(input);
      if (mounted.current) {
        setSettings(saved);
      }
      await refreshStatus();
      return saved;
    },
    [refreshStatus],
  );

  const remove = useCallback(async () => {
    await removeSettings();
    await Promise.all([refreshSettings(), refreshStatus()]);
  }, [refreshSettings, refreshStatus]);

  /** "Retry now": reconnects at once and shows the status right after. Needs `canManage`. */
  const retryNow = useCallback(async () => {
    const next = await withTimeout(reconnect());
    if (!mounted.current) return;
    statusSeq.current += 1;
    setStatus(next);
    setStatusError(null);
  }, []);

  return { settings, settingsError, status, statusError, loading, save, remove, retryNow };
}
