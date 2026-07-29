// Shelly device registry UI. Laid out like the host's other management pages
// (e.g. MQTT servers): a page header with the primary actions that open drawers,
// and the devices rendered in a Table — not nested cards.
// Built from the host's shared HeroUI kit so it inherits the app theme.
import {
  Button,
  Chip,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  useOverlayState,
} from '@heroui/react';
import { MehIcon, PlusIcon, RefreshCwIcon, SearchIcon, Trash2Icon, WifiIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AddDeviceDrawer } from './AddDeviceDrawer';
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
    <Chip variant="soft" color={color}>
      {label}
    </Chip>
  );
}

function EmptyDevices() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10">
      <MehIcon size={36} className="text-muted" />
      <p className="text-sm text-muted">No devices yet. Run discovery, or add one by IP.</p>
    </div>
  );
}

export function DevicesPage() {
  const [devices, setDevices] = useState<ShellyDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);
  const addDrawer = useOverlayState();
  const discoverDrawer = useOverlayState();

  const refresh = useCallback(async () => {
    try {
      setDevices(await listDevices());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
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
        setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        setRowBusyId(null);
      }
    },
    [refresh]
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="mb-2 flex w-full flex-wrap items-center justify-between gap-y-4">
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

      {loadError && (
        <StatusAlert status="danger" title="Failed to load devices">
          {loadError}
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
                <TableColumn isRowHeader>Name</TableColumn>
                <TableColumn>Address</TableColumn>
                <TableColumn>Generation</TableColumn>
                <TableColumn>Model</TableColumn>
                <TableColumn>Auth</TableColumn>
                <TableColumn>Actions</TableColumn>
              </TableHeader>
              <TableBody items={devices} renderEmptyState={() => <EmptyDevices />}>
                {(device) => (
                  <TableRow key={device.id} id={device.id} data-cy={`shelly-device-row-${device.id}`}>
                    <TableCell>
                      <div className="font-medium text-foreground">{device.name}</div>
                      {device.lastProbeError && (
                        <div className="text-xs text-danger" data-cy="shelly-device-probe-error">
                          Probe failed: {device.lastProbeError}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{device.ipAddress}</TableCell>
                    <TableCell>{generationLabel(device.generation)}</TableCell>
                    <TableCell>{device.model ?? '—'}</TableCell>
                    <TableCell>
                      <AuthChip state={device.authState} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-row gap-2">
                        <Button
                          variant="ghost"
                          isDisabled={rowBusyId === device.id}
                          onPress={() => withRowBusy(device.id, () => reprobeDevice(device.id))}
                          data-cy={`shelly-device-reprobe-${device.id}`}
                        >
                          <RefreshCwIcon className="h-4 w-4" /> Re-probe
                        </Button>
                        <Button
                          variant="danger-soft"
                          isDisabled={rowBusyId === device.id}
                          onPress={() => withRowBusy(device.id, () => deleteDevice(device.id))}
                          data-cy={`shelly-device-delete-${device.id}`}
                        >
                          <Trash2Icon className="h-4 w-4" /> Delete
                        </Button>
                      </div>
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
    </div>
  );
}
