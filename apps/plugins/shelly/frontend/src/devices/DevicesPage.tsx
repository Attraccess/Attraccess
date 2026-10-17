import {
  Button,
  Chip,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownTrigger,
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
  Tooltip,
} from '@heroui/react';
import {
  CpuIcon,
  InfoIcon,
  KeyRoundIcon,
  MehIcon,
  MoreVerticalIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
  TriangleAlertIcon,
  WifiIcon,
} from 'lucide-react';
import { AddDeviceDrawer } from './AddDeviceDrawer';
import { AdminPasswordDrawer } from '../AdminPasswordDrawer';
import type { AuthState } from '../api';
import { DeviceInfoDrawer } from './info/DeviceInfoDrawer';
import { DiscoverDrawer } from '../DiscoverDrawer';
import { FirmwareDrawer } from './firmware/FirmwareDrawer';
import { useShellyTranslations } from '../i18n';
import { renderDevicesPageDevicesRows } from '../renderDevicesPageDevicesRows';
import { StatusAlert } from '../shared/StatusAlert';
import { useDevicesPageState } from '../useDevicesPageState';

export function AuthChip({ state }: { state: AuthState }) {
  const { t } = useShellyTranslations();
  const map = {
    none: { color: 'success' as const },
    required: { color: 'warning' as const },
    unknown: { color: 'default' as const },
  };
  const { color } = map[state];
  return (
    <Chip variant="soft" color={color} size="sm" className="sh:whitespace-nowrap">
      {t(`auth.${state}`)}
    </Chip>
  );
}

export function EmptyDevices({ onAdd }: { onAdd: () => void }) {
  const { t } = useShellyTranslations();
  return (
    <div className="sh:flex sh:flex-col sh:items-center sh:justify-center sh:gap-3 sh:px-4 sh:py-12">
      <MehIcon size={36} className="sh:text-default-300" />
      <p className="sh:text-sm sh:text-default-500">{t('devices.empty')}</p>
      <Button variant="secondary" size="sm" onPress={onAdd} data-cy="shelly-add-open-empty">
        <PlusIcon className="sh:h-4 sh:w-4" /> {t('devices.add')}
      </Button>
    </div>
  );
}

export function ProbeErrorIndicator({ message }: { message: string }) {
  const { t } = useShellyTranslations();
  return (
    <Tooltip>
      <Tooltip.Trigger>
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          aria-label={t('devices.probeError', { message })}
          className="sh:h-6 sh:w-6 sh:min-w-6 sh:text-warning"
          data-cy="shelly-device-probe-error"
        >
          <TriangleAlertIcon className="sh:h-4 sh:w-4" />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>{t('devices.probeError', { message })}</Tooltip.Content>
    </Tooltip>
  );
}

export function RowActions({
  deviceId,
  isBusy,
  onInfo,
  onFirmware,
  onAuth,
  onReprobe,
  onDelete,
}: {
  deviceId: number;
  isBusy: boolean;
  onInfo: () => void;
  onFirmware: () => void;
  onAuth: () => void;
  onReprobe: () => void;
  onDelete: () => void;
}) {
  const { t } = useShellyTranslations();
  return (
    <div className="sh:flex sh:flex-row sh:items-center sh:justify-end sh:gap-1 sh:whitespace-nowrap">
      <Tooltip>
        <Tooltip.Trigger>
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            aria-label={t('devices.info')}
            isDisabled={isBusy}
            onPress={onInfo}
            data-cy={`shelly-device-info-${deviceId}`}
          >
            <InfoIcon className="sh:h-4 sh:w-4" />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>{t('devices.info')}</Tooltip.Content>
      </Tooltip>
      <Dropdown>
        <DropdownTrigger>
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            aria-label={t('devices.more')}
            isPending={isBusy}
            data-cy={`shelly-device-menu-${deviceId}`}
          >
            <MoreVerticalIcon className="sh:h-4 sh:w-4" />
          </Button>
        </DropdownTrigger>
        <DropdownPopover>
          <DropdownMenu aria-label={t('devices.deviceActions')}>
            <DropdownItem id="firmware" onPress={onFirmware} data-cy={`shelly-device-firmware-${deviceId}`}>
              <CpuIcon className="sh:mr-2 sh:inline sh:h-4 sh:w-4" /> {t('devices.manageFirmware')}
            </DropdownItem>
            <DropdownItem id="auth" onPress={onAuth} data-cy={`shelly-device-auth-${deviceId}`}>
              <KeyRoundIcon className="sh:mr-2 sh:inline sh:h-4 sh:w-4" /> {t('devices.password')}
            </DropdownItem>
            <DropdownItem id="reprobe" onPress={onReprobe} data-cy={`shelly-device-reprobe-${deviceId}`}>
              <RefreshCwIcon className="sh:mr-2 sh:inline sh:h-4 sh:w-4" /> {t('devices.reprobe')}
            </DropdownItem>
            <DropdownItem
              id="delete"
              onPress={onDelete}
              className="sh:text-danger"
              data-cy={`shelly-device-delete-${deviceId}`}
            >
              <Trash2Icon className="sh:mr-2 sh:inline sh:h-4 sh:w-4" /> {t('devices.delete')}
            </DropdownItem>
          </DropdownMenu>
        </DropdownPopover>
      </Dropdown>
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
