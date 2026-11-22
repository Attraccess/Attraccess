import { PageHeader, StatusAlert, TableDataLoadingIndicator } from '@attraccess/plugins-frontend-ui';
import { useOverlayState } from '@heroui/react';
import { BluetoothIcon, PlusIcon, SearchIcon, WifiIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { deleteDevice, listDevices, listFirmware, type FirmwareOverviewEntry, type ShellyDevice } from '../api';
import { AddDeviceDrawer } from './AddDeviceDrawer';
import { AdminPasswordDrawer } from '../AdminPasswordDrawer';
import { BluetoothSetupDrawer } from './bluetooth/BluetoothSetupDrawer';
import { DeviceInfoDrawer } from './info/DeviceInfoDrawer';
import { DiscoverDrawer } from '../DiscoverDrawer';
import { FirmwareDrawer } from './firmware/FirmwareDrawer';
import { useShellyTranslations } from '../i18n';
import { DevicesTable } from './DevicesTable';

export function DevicesPage() {
  const { t } = useShellyTranslations();
  const [devices, setDevices] = useState<ShellyDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);
  const [infoDevice, setInfoDevice] = useState<ShellyDevice | null>(null);
  const [authDevice, setAuthDevice] = useState<ShellyDevice | null>(null);
  const [firmwareDevice, setFirmwareDevice] = useState<ShellyDevice | null>(null);
  const [firmware, setFirmware] = useState<Record<number, FirmwareOverviewEntry>>({});
  const addDrawer = useOverlayState();
  const discoverDrawer = useOverlayState();
  const bluetoothDrawer = useOverlayState();

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

  const removeDevice = useCallback(
    async (device: ShellyDevice) => {
      try {
        await deleteDevice(device.id);
        await refresh();
      } catch (err) {
        setPageError(err instanceof Error ? err.message : String(err));
      }
    },
    [refresh],
  );

  return (
    <div className="sh:mx-auto sh:flex sh:w-full sh:max-w-5xl sh:flex-col sh:gap-6 sh:p-4 sh:md:p-6">
      <PageHeader
        noMargin
        icon={<WifiIcon className="sh:h-6 sh:w-6 sh:text-accent-soft-foreground" />}
        title={t('devices.title')}
        subtitle={t('devices.description')}
        actions={[
          {
            key: 'bluetooth',
            label: t('devices.bluetooth'),
            icon: <BluetoothIcon className="sh:h-4 sh:w-4" />,
            variant: 'secondary',
            onPress: bluetoothDrawer.open,
            dataCy: 'shelly-ble-open',
          },
          {
            key: 'discover',
            label: t('devices.discover'),
            icon: <SearchIcon className="sh:h-4 sh:w-4" />,
            variant: 'secondary',
            onPress: discoverDrawer.open,
            dataCy: 'shelly-discover-open',
          },
          {
            key: 'add',
            label: t('devices.add'),
            icon: <PlusIcon className="sh:h-4 sh:w-4" />,
            variant: 'primary',
            onPress: addDrawer.open,
            dataCy: 'shelly-add-open',
          },
        ]}
      />

      {pageError && (
        <StatusAlert status="danger" title={t('devices.loadError')}>
          {pageError}
        </StatusAlert>
      )}

      {loading ? (
        <TableDataLoadingIndicator />
      ) : (
        <DevicesTable
          devices={devices}
          firmware={firmware}
          rowBusyId={rowBusyId}
          onAdd={addDrawer.open}
          setInfoDevice={setInfoDevice}
          setFirmwareDevice={setFirmwareDevice}
          setAuthDevice={setAuthDevice}
          onDelete={removeDevice}
          withRowBusy={withRowBusy}
        />
      )}

      <AddDeviceDrawer isOpen={addDrawer.isOpen} onOpenChange={addDrawer.setOpen} onAdded={refresh} />
      <BluetoothSetupDrawer
        isOpen={bluetoothDrawer.isOpen}
        onOpenChange={bluetoothDrawer.setOpen}
        onRegistered={refresh}
      />
      <DiscoverDrawer isOpen={discoverDrawer.isOpen} onOpenChange={discoverDrawer.setOpen} onDiscovered={refresh} />
      <DeviceInfoDrawer device={infoDevice} onOpenChange={(open) => !open && setInfoDevice(null)} />
      <AdminPasswordDrawer
        device={authDevice}
        onOpenChange={(open) => !open && setAuthDevice(null)}
        onSaved={refresh}
      />
      <FirmwareDrawer
        device={firmwareDevice}
        onOpenChange={(open) => !open && setFirmwareDevice(null)}
        onUpdated={() => void refreshFirmware(devices)}
      />
    </div>
  );
}
