// Shelly device registry UI. Laid out like the host's other management pages
// (e.g. MQTT servers): a page header with primary actions that open drawers,
// and the devices rendered in a Table — not nested cards.
// Built from the host's shared HeroUI kit so it inherits the app theme.
import {
  Button,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Spinner,
  Table,
  TableBody,
  TableColumn,
  TableContent,
  TableHeader,
  TableScrollContainer,
} from '@heroui/react';
import { PlusIcon, SearchIcon, Trash2Icon, WifiIcon } from 'lucide-react';
import { AddDeviceDrawer } from './AddDeviceDrawer';
import { AdminPasswordDrawer } from './AdminPasswordDrawer';
import { DeviceInfoDrawer } from './DeviceInfoDrawer';
import { DiscoverDrawer } from './DiscoverDrawer';
import { StatusAlert } from './StatusAlert';
import { FirmwareDrawer } from './FirmwareDrawer';
import { EmptyDevices } from './DevicesPage.helpers';
import { useDevicesPageState } from './useDevicesPageState';
import { renderDevicesPageDevicesRows } from './renderDevicesPageDevicesRows';

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
      <div className="sh:flex sh:w-full sh:flex-wrap sh:items-center sh:justify-between sh:gap-y-4">
        <div className="sh:flex sh:items-center sh:gap-3">
          <WifiIcon className="sh:h-6 sh:w-6 sh:text-accent-soft-foreground" />
          <div>
            <h1 className="sh:text-2xl sh:font-bold">{t('devices.title')}</h1>
            <p className="sh:mt-1 sh:text-sm sh:text-muted">{t('devices.description')}</p>
          </div>
        </div>
        <div className="sh:flex sh:flex-wrap sh:gap-2">
          <Button variant="secondary" onPress={discoverDrawer.open} data-cy="shelly-discover-open">
            <SearchIcon className="sh:h-4 sh:w-4" /> {t('devices.discover')}
          </Button>
          <Button variant="primary" onPress={addDrawer.open} data-cy="shelly-add-open">
            <PlusIcon className="sh:h-4 sh:w-4" /> {t('devices.add')}
          </Button>
        </div>
      </div>

      {pageError && (
        <StatusAlert status="danger" title={t('devices.loadError')}>
          {pageError}
        </StatusAlert>
      )}

      {loading ? (
        <div className="sh:flex sh:items-center sh:justify-center sh:p-6">
          <Spinner color="accent" />
        </div>
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

      <Modal
        isOpen={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        data-cy="shelly-delete-confirmation-modal"
      >
        <ModalBackdrop>
          <ModalContainer size="sm">
            <ModalDialog>
              <ModalHeader>
                <ModalHeading>{t('devices.delete')}</ModalHeading>
              </ModalHeader>
              <ModalBody>
                <p>{t('devices.deleteDescription', { name: deleteTarget?.name, address: deleteTarget?.ipAddress })}</p>
              </ModalBody>
              <ModalFooter>
                <Button variant="secondary" onPress={() => setDeleteTarget(null)} data-cy="shelly-delete-cancel">
                  {t('common.cancel')}
                </Button>
                <Button variant="danger" onPress={confirmDelete} isPending={deleting} data-cy="shelly-delete-confirm">
                  <Trash2Icon className="sh:h-4 sh:w-4" /> {t('common.delete')}
                </Button>
              </ModalFooter>
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    </div>
  );
}

export { RowActions } from './DevicesPage.helpers';
