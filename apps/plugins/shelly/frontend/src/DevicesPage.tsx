// Shelly device registry UI. Laid out like the host's other management pages
// (e.g. MQTT servers): a page header with primary actions that open drawers,
// and the devices rendered in a Table — not nested cards.
// Built from the host's shared HeroUI kit so it inherits the app theme.
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
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  Tooltip,
  useOverlayState,
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
import { useCallback, useEffect, useState } from 'react';
import { AddDeviceDrawer } from './AddDeviceDrawer';
import { AdminPasswordDrawer } from './AdminPasswordDrawer';
import { DeviceInfoDrawer } from './DeviceInfoDrawer';
import { DiscoverDrawer } from './DiscoverDrawer';
import { StatusAlert } from './StatusAlert';
import { FirmwareCell, FirmwareDrawer, UpdateAvailableIndicator } from './FirmwareDrawer';
import {
  deleteDevice,
  listDevices,
  listFirmware,
  reprobeDevice,
  type AuthState,
  type FirmwareOverviewEntry,
  type ShellyDevice,
} from './api';

import { useShellyTranslations } from './i18n';

function AuthChip({ state }: { state: AuthState }) {
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

function ProbeErrorIndicator({ message }: { message: string }) {
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

function EmptyDevices({ onAdd }: { onAdd: () => void }) {
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

export function DevicesPage() {
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
                {(device) => (
                  <TableRow key={device.id} id={device.id} data-cy={`shelly-device-row-${device.id}`}>
                    <TableCell className="sh:whitespace-nowrap">
                      <div className="sh:flex sh:items-center sh:gap-1">
                        <span
                          className="sh:max-w-36 sh:truncate sh:font-medium sh:text-default-800 sh:sm:max-w-48"
                          title={device.name}
                        >
                          {device.name}
                        </span>
                        {device.lastProbeError && <ProbeErrorIndicator message={device.lastProbeError} />}
                        <UpdateAvailableIndicator entry={firmware[device.id]} />
                      </div>
                      <div className="sh:text-xs sh:text-default-500 sh:sm:hidden sh:md:block sh:lg:hidden">
                        {device.ipAddress}
                      </div>
                    </TableCell>
                    <TableCell className="sh:hidden sh:whitespace-nowrap sh:text-default-600 sh:sm:table-cell sh:md:hidden sh:lg:table-cell">
                      {device.ipAddress}
                    </TableCell>
                    <TableCell className="sh:hidden sh:whitespace-nowrap sh:lg:table-cell">
                      <div className="sh:flex sh:items-center sh:gap-1.5">
                        <span className="sh:max-w-36 sh:truncate" title={device.model ?? undefined}>
                          {device.model ?? '—'}
                        </span>
                        <Chip variant="soft" size="sm" className="sh:whitespace-nowrap">
                          {device.generation === null
                            ? t('devices.unknown')
                            : t(device.generation === 1 ? 'devices.generation' : 'devices.generationPlus', {
                                generation: device.generation,
                              })}
                        </Chip>
                      </div>
                    </TableCell>
                    <TableCell className="sh:hidden sh:whitespace-nowrap sh:sm:table-cell">
                      <AuthChip state={device.authState} />
                    </TableCell>
                    <TableCell className="sh:hidden sh:whitespace-nowrap sh:xl:table-cell">
                      <FirmwareCell entry={firmware[device.id]} />
                    </TableCell>
                    <TableCell className="sh:whitespace-nowrap">
                      <RowActions
                        deviceId={device.id}
                        isBusy={rowBusyId === device.id}
                        onInfo={() => setInfoDevice(device)}
                        onFirmware={() => setFirmwareDevice(device)}
                        onAuth={() => setAuthDevice(device)}
                        onReprobe={() => withRowBusy(device.id, () => reprobeDevice(device.id))}
                        onDelete={() => setDeleteTarget(device)}
                      />
                    </TableCell>
                  </TableRow>
                )}
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
