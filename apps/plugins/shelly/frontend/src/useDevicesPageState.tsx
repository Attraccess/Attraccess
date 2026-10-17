import { useOverlayState } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';
import { deleteDevice, listDevices, listFirmware, type FirmwareOverviewEntry, type ShellyDevice } from './api';
import { useShellyTranslations } from './i18n';

export function useDevicesPageState() {
  const { t, language } = useShellyTranslations();
  const [devices, setDevices] = useState<ShellyDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);
  const [infoDevice, setInfoDevice] = useState<ShellyDevice | null>(null);
  const [authDevice, setAuthDevice] = useState<ShellyDevice | null>(null);
  const [firmwareDevice, setFirmwareDevice] = useState<ShellyDevice | null>(null);
  const [firmware, setFirmware] = useState<Record<number, FirmwareOverviewEntry>>({});
  const [deleteTarget, setDeleteTarget] = useState<ShellyDevice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const addDrawer = useOverlayState();
  const discoverDrawer = useOverlayState();

  // Firmware checks talk to every device (and, on Gen2+, to the Shelly update
  // server), so they run after the list rather than holding the table hostage.
  // A failure only degrades the firmware column.
  const refreshFirmware = useCallback(async (known: ShellyDevice[] = []) => {
    try {
      const entries = await listFirmware();
      setFirmware(Object.fromEntries(entries.map((entry) => [entry.deviceId, entry])));
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      setFirmware(Object.fromEntries(known.map((device) => [device.id, { deviceId: device.id, status: null, error }])));
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await listDevices();
      setDevices(next);
      setPageError(null);
      void refreshFirmware(next);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [refreshFirmware]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const withRowBusy = useCallback(
    async (id: number, action: () => Promise<unknown>) => {
      setRowBusyId(id);
      try {
        await action();
        await refresh();
      } catch (err) {
        setPageError(err instanceof Error ? err.message : String(err));
      } finally {
        setRowBusyId(null);
      }
    },
    [refresh],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDevice(deleteTarget.id);
      await refresh();
      setDeleteTarget(null);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : String(err));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, refresh]);
  return {
    t,
    language,
    devices,
    loading,
    pageError,
    rowBusyId,
    infoDevice,
    setInfoDevice,
    authDevice,
    setAuthDevice,
    firmwareDevice,
    setFirmwareDevice,
    firmware,
    deleteTarget,
    setDeleteTarget,
    deleting,
    addDrawer,
    discoverDrawer,
    refreshFirmware,
    refresh,
    withRowBusy,
    confirmDelete,
  } as const;
}
