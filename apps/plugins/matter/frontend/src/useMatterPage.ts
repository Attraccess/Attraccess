import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage } from './errorMessage';
import type { MatterConnectionValue } from './MatterConnectionContext';
import type { MatterPermissions } from './permissions';
import { useDocumentVisible } from './useDocumentVisible';
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

function withTimeout<T>(request: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The request timed out.')), REQUEST_TIMEOUT_MS);
    request.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/**
 * Polls the connection status while the page is open (`canRead`), and the settings while the Infrastructure tab, which
 * edits them, is open (`settingsActive`, `canManage`): a change another administrator saved reaches the open form (see
 * SettingsForm), and a first load that failed (API briefly down) is retried without a manual reload. Saving and
 * removing refresh both. Both polls pause while the browser tab is hidden and load once when it is visible again.
 *
 * A poll tick is skipped while an earlier request is still pending, so a hanging API does not pile up requests, and
 * only the newest request may update the page, so a late poll answer never overwrites a newer one (or a save).
 *
 * Nothing is requested that the API would refuse: the status needs `canRead`, the settings need `canManage`. Until the
 * host has pushed the auth state (`known`), nothing is requested and the page keeps loading.
 */
export function useMatterPage(
  { known, canRead, canManage }: MatterPermissions,
  settingsActive: boolean,
): MatterConnectionValue {
  const [settings, setSettings] = useState<ConnectionSettings | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const visible = useDocumentVisible();
  const mounted = useRef(true);
  const statusSeq = useRef(0);
  const statusPending = useRef(0);
  const hasStatus = useRef(false);
  const settingsSeq = useRef(0);
  const settingsPending = useRef(0);

  const refreshStatus = useCallback(async () => {
    const seq = ++statusSeq.current;
    statusPending.current += 1;
    try {
      const next = await withTimeout(getStatus());
      if (!mounted.current || seq !== statusSeq.current) return;
      hasStatus.current = true;
      setStatus(next);
      setStatusError(null);
    } catch (error) {
      if (mounted.current && seq === statusSeq.current) setStatusError(errorMessage(error));
    } finally {
      statusPending.current -= 1;
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    const seq = ++settingsSeq.current;
    settingsPending.current += 1;
    try {
      const next = await withTimeout(getSettings());
      if (!mounted.current || seq !== settingsSeq.current) return;
      setSettings(next);
      setSettingsError(null);
    } catch (error) {
      if (mounted.current && seq === settingsSeq.current) setSettingsError(errorMessage(error));
    } finally {
      settingsPending.current -= 1;
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
    if (!canRead) {
      setStatusLoading(false);
      return;
    }
    if (!visible) return;
    // Per run: when the permissions change, the previous run's late answer must not end the new run's loading. A run
    // that starts without a status (read was just granted) loads again; one that resumes a visible tab does not.
    let cancelled = false;
    if (!hasStatus.current) setStatusLoading(true);
    void refreshStatus().finally(() => !cancelled && setStatusLoading(false));
    const timer = setInterval(() => {
      if (statusPending.current === 0) void refreshStatus();
    }, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [known, canRead, visible, refreshStatus]);

  useEffect(() => {
    if (!known || !canManage || !settingsActive || !visible) return;
    void refreshSettings();
    const timer = setInterval(() => {
      if (settingsPending.current === 0) void refreshSettings();
    }, STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [known, canManage, settingsActive, visible, refreshSettings]);

  const save = useCallback(
    async (input: SettingsInput) => {
      const saved = await saveSettings(input);
      if (mounted.current) {
        // A poll that started before the save must not bring the old settings back.
        settingsSeq.current += 1;
        setSettings(saved);
        setSettingsError(null);
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
    hasStatus.current = true;
    setStatus(next);
    setStatusError(null);
  }, []);

  // The settings are loading while the tab that shows them waits for their first answer.
  const settingsLoading = canManage && settingsActive && settings === null && settingsError === null;
  const loading = !known || (canRead && statusLoading) || settingsLoading;
  return useMemo(
    () => ({ settings, settingsError, status, statusError, loading, save, remove, retryNow }),
    [settings, settingsError, status, statusError, loading, save, remove, retryNow],
  );
}
