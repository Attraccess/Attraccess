import { useCallback, useEffect, useRef, useState } from 'react';
import { getFirmware, startFirmwareUpdate, type FirmwareStage, type FirmwareStatus, type ShellyDevice } from './api';
import { useShellyTranslations } from './i18n';
import { TranslationMessage } from '@attraccess/plugins-frontend-ui';
import { usePluginLiveUpdates } from '@attraccess/plugins-frontend-sdk';
import { UPDATE_TIMEOUT_MS } from './FirmwareDrawer.update-timeout-ms';

export function useFirmwareDrawerState({
  device,
  onOpenChange,
  onUpdated,
}: {
  device: ShellyDevice | null;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}) {
  const { t, tMessage } = useShellyTranslations();
  const [status, setStatus] = useState<FirmwareStatus | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | TranslationMessage | null>(null);
  const [installing, setInstalling] = useState<FirmwareStage | null>(null);
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const targetVersion = useRef<string | null>(null);
  const deadline = useRef(0);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const fetchStatus = useCallback(async () => {
    if (!device) return null;
    return getFirmware(device.id, { currentPassword: currentPassword || undefined });
  }, [device, currentPassword]);

  const load = useCallback(async () => {
    if (!device) return;
    setLoading(true);
    setError(null);
    try {
      setStatus(await fetchStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [device, fetchStatus]);

  useEffect(() => {
    if (!device) return;
    setStatus(null);
    setInstalling(null);
    setInstalledVersion(null);
    setError(null);
    void load();
    // Deliberately keyed on `device` alone: `load` also changes with the typed
    // password, which must not refetch on every keystroke.
  }, [device]);

  const install = useCallback(
    async (stage: FirmwareStage) => {
      if (!device) return;
      setError(null);
      setInstalling(stage);
      targetVersion.current = status?.available[stage] ?? null;
      deadline.current = Date.now() + UPDATE_TIMEOUT_MS;
      try {
        await startFirmwareUpdate(device.id, { stage, currentPassword: currentPassword || undefined });
      } catch (err) {
        setInstalling(null);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [currentPassword, device, status],
  );

  usePluginLiveUpdates<{ eventType: 'snapshot'; value: FirmwareStatus } | { eventType: 'unavailable' }>({
    plugin: 'shelly',
    topic: 'firmware',
    identifier: String(device?.id),
    enabled: !!installing && !!device,
    onUpdate: (event) => {
      if (event.eventType !== 'snapshot') return;
      const next = event.value;
      setStatus(next);
      const done = targetVersion.current ? next.currentVersion === targetVersion.current : !next.hasUpdate;
      if (done && next.state !== 'updating' && next.state !== 'pending') {
        setInstalling(null);
        setInstalledVersion(next.currentVersion);
        onUpdated();
      }
    },
  });

  // The deadline must still fire if the stream/device is offline or silently rolls back.
  useEffect(() => {
    if (!installing || !device) return;
    const timeout = setTimeout(
      () => {
        setInstalling(null);
        setError({ key: 'firmware.timeout' });
      },
      Math.max(0, deadline.current - Date.now()),
    );
    return () => clearTimeout(timeout);
  }, [installing, device]);

  const stages: FirmwareStage[] = ['stable', 'beta'];
  return {
    t,
    tMessage,
    status,
    currentPassword,
    setCurrentPassword,
    loading,
    error,
    installing,
    installedVersion,
    targetVersion,
    close,
    load,
    install,
    stages,
    device,
    onOpenChange,
  };
}
