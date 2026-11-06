import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getSettings,
  getStatus,
  removeSettings,
  saveSettings,
  type ConnectionSettings,
  type ConnectionStatus,
  type SettingsInput,
} from './api';

/** How often the open page refreshes the connection status. */
export const STATUS_POLL_MS = 5_000;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Loads the settings and polls the status while the page is open. Saving and removing refresh both. If the first
 * settings load failed (API briefly down), the poll retries it so the form appears without a manual reload.
 */
export function useMatterPage() {
  const [settings, setSettings] = useState<ConnectionSettings | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  const settingsLoaded = useRef(false);

  const refreshStatus = useCallback(async () => {
    try {
      const next = await getStatus();
      if (!mounted.current) return;
      setStatus(next);
      setStatusError(null);
    } catch (error) {
      if (mounted.current) setStatusError(messageOf(error));
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      const next = await getSettings();
      if (!mounted.current) return;
      settingsLoaded.current = true;
      setSettings(next);
    } catch (error) {
      if (mounted.current) setStatusError(messageOf(error));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void Promise.all([refreshSettings(), refreshStatus()]).finally(() => mounted.current && setLoading(false));
    const timer = setInterval(() => {
      void refreshStatus();
      if (!settingsLoaded.current) void refreshSettings();
    }, STATUS_POLL_MS);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [refreshSettings, refreshStatus]);

  const save = useCallback(
    async (input: SettingsInput) => {
      const saved = await saveSettings(input);
      setSettings(saved);
      await refreshStatus();
    },
    [refreshStatus],
  );

  const remove = useCallback(async () => {
    await removeSettings();
    await Promise.all([refreshSettings(), refreshStatus()]);
  }, [refreshSettings, refreshStatus]);

  return { settings, status, statusError, loading, save, remove };
}
