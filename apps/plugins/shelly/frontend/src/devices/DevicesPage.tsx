import { PageHeader, StatusAlert, StatusDialog, TableDataLoadingIndicator } from '@attraccess/plugins-frontend-ui';
import { PlusIcon, SearchIcon, WifiIcon } from 'lucide-react';
import { AddDeviceDrawer } from './AddDeviceDrawer';
import { AdminPasswordDrawer } from '../AdminPasswordDrawer';
import { DeviceInfoDrawer } from './info/DeviceInfoDrawer';
import { DiscoverDrawer } from '../DiscoverDrawer';
import { FirmwareDrawer } from './firmware/FirmwareDrawer';
import { useShellyTranslations } from '../i18n';
import { DevicesTable } from './DevicesTable';
import { useDevicesPageState } from './useDevicesPageState';

export function DevicesPage() {
  const { t } = useShellyTranslations();
  const {
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
  } = useDevicesPageState();

  return (
    <div className="sh:mx-auto sh:flex sh:w-full sh:max-w-5xl sh:flex-col sh:gap-6 sh:p-4 sh:md:p-6">
      <PageHeader
        noMargin
        icon={<WifiIcon className="sh:h-6 sh:w-6 sh:text-accent-soft-foreground" />}
        title={t('devices.title')}
        subtitle={t('devices.description')}
        actions={[
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
          setDeleteTarget={setDeleteTarget}
          withRowBusy={withRowBusy}
        />
      )}

      <AddDeviceDrawer isOpen={addDrawer.isOpen} onOpenChange={addDrawer.setOpen} onAdded={refresh} />
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

      <StatusDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        status="error"
        title={t('devices.delete')}
        action={{
          label: t('common.delete'),
          onPress: confirmDelete,
          isPending: deleting,
          'data-cy': 'shelly-delete-confirm',
        }}
        closeLabel={t('common.cancel')}
        closeDataCy="shelly-delete-cancel"
        data-cy="shelly-delete-confirmation-modal"
      >
        {t('devices.deleteDescription', { name: deleteTarget?.name, address: deleteTarget?.ipAddress })}
      </StatusDialog>
    </div>
  );
}
