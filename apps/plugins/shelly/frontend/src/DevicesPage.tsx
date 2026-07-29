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
import { deleteDevice, listDevices, reprobeDevice, type AuthState, type ShellyDevice } from './api';

function generationLabel(generation: number | null): string {
  if (generation === null) return 'Unknown';
  return generation === 1 ? 'Gen 1' : `Gen ${generation}+`;
}

function AuthChip({ state }: { state: AuthState }) {
  const map = {
    none: { color: 'success' as const, label: 'No auth' },
    required: { color: 'warning' as const, label: 'Auth required' },
    unknown: { color: 'default' as const, label: 'Unknown' },
  };
  const { color, label } = map[state];
  return (
    <Chip variant="soft" color={color} size="sm" className="whitespace-nowrap">
      {label}
    </Chip>
  );
}

function ProbeErrorIndicator({ message }: { message: string }) {
  return (
    <Tooltip>
      <Tooltip.Trigger>
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          aria-label={`Probe failed: ${message}`}
          className="h-6 w-6 min-w-6 text-warning"
          data-cy="shelly-device-probe-error"
        >
          <TriangleAlertIcon className="h-4 w-4" />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>Probe failed: {message}</Tooltip.Content>
    </Tooltip>
  );
}

function RowActions({
  deviceId,
  isBusy,
  onInfo,
  onAuth,
  onReprobe,
  onDelete,
}: {
  deviceId: number;
  isBusy: boolean;
  onInfo: () => void;
  onAuth: () => void;
  onReprobe: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-row items-center justify-end gap-1 whitespace-nowrap">
      <Tooltip>
        <Tooltip.Trigger>
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            aria-label="View device info"
            isDisabled={isBusy}
            onPress={onInfo}
            data-cy={`shelly-device-info-${deviceId}`}
          >
            <InfoIcon className="h-4 w-4" />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>View device info</Tooltip.Content>
      </Tooltip>
      <Dropdown>
        <DropdownTrigger>
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            aria-label="More actions"
            isPending={isBusy}
            data-cy={`shelly-device-menu-${deviceId}`}
          >
            <MoreVerticalIcon className="h-4 w-4" />
          </Button>
        </DropdownTrigger>
        <DropdownPopover>
          <DropdownMenu aria-label="Device actions">
            <DropdownItem id="auth" onPress={onAuth} data-cy={`shelly-device-auth-${deviceId}`}>
              <KeyRoundIcon className="mr-2 inline h-4 w-4" /> Set admin password
            </DropdownItem>
            <DropdownItem id="reprobe" onPress={onReprobe} data-cy={`shelly-device-reprobe-${deviceId}`}>
              <RefreshCwIcon className="mr-2 inline h-4 w-4" /> Re-probe device
            </DropdownItem>
            <DropdownItem id="delete" onPress={onDelete} className="text-danger" data-cy={`shelly-device-delete-${deviceId}`}>
              <Trash2Icon className="mr-2 inline h-4 w-4" /> Delete device
            </DropdownItem>
          </DropdownMenu>
        </DropdownPopover>
      </Dropdown>
    </div>
  );
}

function EmptyDevices({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-12">
      <MehIcon size={36} className="text-default-300" />
      <p className="text-sm text-default-500">No devices yet. Run discovery, or add your first Shelly by its IP.</p>
      <Button variant="secondary" size="sm" onPress={onAdd} data-cy="shelly-add-open-empty">
        <PlusIcon className="h-4 w-4" /> Add device
      </Button>
    </div>
  );
}

export function DevicesPage() {
  const [devices, setDevices] = useState<ShellyDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);
  const [infoDevice, setInfoDevice] = useState<ShellyDevice | null>(null);
  const [authDevice, setAuthDevice] = useState<ShellyDevice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ShellyDevice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const addDrawer = useOverlayState();
  const discoverDrawer = useOverlayState();

  const refresh = useCallback(async () => {
    try {
      setDevices(await listDevices());
      setPageError(null);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

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
    [refresh]
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
      <div className="flex w-full flex-wrap items-center justify-between gap-y-4">
        <div className="flex items-center gap-3">
          <WifiIcon className="h-6 w-6 text-accent-soft-foreground" />
          <div>
            <h1 className="text-2xl font-bold">Shelly Devices</h1>
            <p className="mt-1 text-sm text-muted">Discovered and manually added Shelly devices.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onPress={discoverDrawer.open} data-cy="shelly-discover-open">
            <SearchIcon className="h-4 w-4" /> Discover
          </Button>
          <Button variant="primary" onPress={addDrawer.open} data-cy="shelly-add-open">
            <PlusIcon className="h-4 w-4" /> Add device
          </Button>
        </div>
      </div>

      {pageError && (
        <StatusAlert status="danger" title="Failed to load devices">
          {pageError}
        </StatusAlert>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-6">
          <Spinner color="accent" />
        </div>
      ) : (
        <Table data-cy="shelly-device-table">
          <TableScrollContainer>
            <TableContent aria-label="Shelly devices">
              <TableHeader>
                <TableColumn isRowHeader>Device</TableColumn>
                <TableColumn className="hidden sm:table-cell md:hidden lg:table-cell">Address</TableColumn>
                <TableColumn className="hidden lg:table-cell">Model</TableColumn>
                <TableColumn className="hidden sm:table-cell">Auth</TableColumn>
                <TableColumn className="text-end">Actions</TableColumn>
              </TableHeader>
              <TableBody items={devices} renderEmptyState={() => <EmptyDevices onAdd={addDrawer.open} />}>
                {(device) => (
                  <TableRow key={device.id} id={device.id} data-cy={`shelly-device-row-${device.id}`}>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <span className="max-w-36 truncate font-medium text-default-800 sm:max-w-48" title={device.name}>
                          {device.name}
                        </span>
                        {device.lastProbeError && <ProbeErrorIndicator message={device.lastProbeError} />}
                      </div>
                      <div className="text-xs text-default-500 sm:hidden md:block lg:hidden">{device.ipAddress}</div>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-default-600 sm:table-cell md:hidden lg:table-cell">
                      {device.ipAddress}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap lg:table-cell">
                      <div className="flex items-center gap-1.5">
                        <span className="max-w-36 truncate" title={device.model ?? undefined}>
                          {device.model ?? '—'}
                        </span>
                        <Chip variant="soft" size="sm" className="whitespace-nowrap">
                          {generationLabel(device.generation)}
                        </Chip>
                      </div>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap sm:table-cell">
                      <AuthChip state={device.authState} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <RowActions
                        deviceId={device.id}
                        isBusy={rowBusyId === device.id}
                        onInfo={() => setInfoDevice(device)}
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
      <DiscoverDrawer
        isOpen={discoverDrawer.isOpen}
        onOpenChange={discoverDrawer.setOpen}
        onDiscovered={refresh}
      />
      <DeviceInfoDrawer device={infoDevice} onOpenChange={(open) => !open && setInfoDevice(null)} />
      <AdminPasswordDrawer device={authDevice} onOpenChange={(open) => !open && setAuthDevice(null)} onSaved={refresh} />

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
                <ModalHeading>Delete device</ModalHeading>
              </ModalHeader>
              <ModalBody>
                <p>
                  Remove <span className="font-semibold">{deleteTarget?.name}</span> ({deleteTarget?.ipAddress}) from the
                  registry? The device itself is not changed.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="secondary" onPress={() => setDeleteTarget(null)} data-cy="shelly-delete-cancel">
                  Cancel
                </Button>
                <Button variant="danger" onPress={confirmDelete} isPending={deleting} data-cy="shelly-delete-confirm">
                  <Trash2Icon className="h-4 w-4" /> Delete
                </Button>
              </ModalFooter>
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    </div>
  );
}
