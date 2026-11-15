import {
  Button,
  EmptyState,
  PageHeader,
  StatusAlert,
  StatusDialog,
  TableDataLoadingIndicator,
} from '@attraccess/plugins-frontend-ui';
import { Table, TableBody, TableColumn, TableContent, TableHeader, TableScrollContainer } from '@heroui/react';
import { PlusIcon, SearchIcon, WifiIcon } from 'lucide-react';
import { AddDeviceDrawer } from './AddDeviceDrawer';
import { AdminPasswordDrawer } from '../AdminPasswordDrawer';
import { DeviceInfoDrawer } from './info/DeviceInfoDrawer';
import { DiscoverDrawer } from '../DiscoverDrawer';
import { FirmwareDrawer } from './firmware/FirmwareDrawer';
import { useShellyTranslations } from '../i18n';
import { renderDevicesPageDevicesRows } from '../renderDevicesPageDevicesRows';
import { useDevicesPageState } from '../useDevicesPageState';

export function EmptyDevices({ onAdd }: { onAdd: () => void }) {
  const { t } = useShellyTranslations();
  return (
    <div className="sh:flex sh:flex-col sh:items-center sh:justify-center sh:gap-3 sh:pb-6">
      <EmptyState message={t('devices.empty')} />
      <Button variant="secondary" size="sm" onPress={onAdd} data-cy="shelly-add-open-empty">
        <PlusIcon className="sh:h-4 sh:w-4" /> {t('devices.add')}
      </Button>
    </div>
  );
}

export function DevicesPage() {
  const {
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
        <Table data-cy="shelly-device-table">
          <TableScrollContainer>
            <TableContent aria-label={t('devices.table')}>
              <TableHeader>
                <TableColumn isRowHeader>{t('devices.device')}</TableColumn>
                <TableColumn className="sh:hidden sh:sm:table-cell sh:md:hidden sh:lg:table-cell">
                  {t('devices.address')}
                </TableColumn>
                <TableColumn className="sh:hidden sh:lg:table-cell">{t('devices.model')}</TableColumn>
                <TableColumn className="sh:hidden sh:sm:table-cell">{t('devices.auth')}</TableColumn>
                <TableColumn className="sh:hidden sh:xl:table-cell">{t('devices.firmware')}</TableColumn>
                <TableColumn className="sh:text-end">{t('devices.actions')}</TableColumn>
              </TableHeader>
              {/* `dependencies` is required: without it react-aria caches the rendered
                  rows, and the row closure keeps the firmware/busy state it was first
                  rendered with. */}
              <TableBody
                items={devices}
                dependencies={[firmware, rowBusyId, language]}
                renderEmptyState={() => <EmptyDevices onAdd={addDrawer.open} />}
              >
                {(device) =>
                  renderDevicesPageDevicesRows(device, {
                    firmware,
                    t,
                    rowBusyId,
                    setInfoDevice,
                    setFirmwareDevice,
                    setAuthDevice,
                    withRowBusy,
                    setDeleteTarget,
                  })
                }
              </TableBody>
            </TableContent>
          </TableScrollContainer>
        </Table>
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
