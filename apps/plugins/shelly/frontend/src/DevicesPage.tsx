// Shelly device registry UI. Laid out like the host's other management pages
// (e.g. MQTT servers): a page header with a primary action that opens an add
// form in a modal, and the devices rendered in a Table — not nested cards.
// Built from the host's shared HeroUI kit so it inherits the app theme.
import {
  Alert,
  AlertContent,
  AlertDescription,
  Button,
  Chip,
  Form,
  Input,
  Label,
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
  TextField,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  useOverlayState,
} from '@heroui/react';
import { MehIcon, PlusIcon, RefreshCwIcon, Trash2Icon, WifiIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { addDevice, deleteDevice, listDevices, reprobeDevice, type AuthState, type ShellyDevice } from './api';

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
      <MehIcon size={36} className="text-default-300" />
      <p className="text-sm text-default-500">No devices yet. Add one by IP to get started.</p>
    </div>
  );
}

function AddDeviceModal({
  isOpen,
  onOpenChange,
  onAdded,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const [ipAddress, setIpAddress] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (close: () => void) => {
      const ip = ipAddress.trim();
      if (!ip) {
        setError('IP address is required.');
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        await addDevice({ ipAddress: ip, name: name.trim() || undefined });
        setIpAddress('');
        setName('');
        onAdded();
        close();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSubmitting(false);
      }
    },
    [ipAddress, name, onAdded]
  );

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalBackdrop>
        <ModalContainer size="md">
          <ModalDialog>
            {({ close }) => (
              <>
                <ModalHeader>
                  <ModalHeading>Add a device</ModalHeading>
                  <p className="text-sm text-default-500">
                    Enter the device's IP address. We probe <code>GET /shelly</code> to detect its generation and
                    model.
                  </p>
                </ModalHeader>
                <ModalBody>
                  <Form onSubmit={() => submit(close)} className="flex flex-col gap-4">
                    <TextFieldRow label="IP address" value={ipAddress} onChange={setIpAddress} placeholder="192.168.1.42" required dataCy="shelly-add-ip" />
                    <TextFieldRow label="Name (optional)" value={name} onChange={setName} placeholder="Workshop light" dataCy="shelly-add-name" />
                    <input type="submit" hidden />
                  </Form>
                  {error && (
                    <Alert status="danger" className="mt-4">
                      <AlertContent>
                        <AlertDescription data-cy="shelly-add-error">{error}</AlertDescription>
                      </AlertContent>
                    </Alert>
                  )}
                </ModalBody>
                <ModalFooter>
                  <Button variant="secondary" onPress={close}>
                    Cancel
                  </Button>
                  <Button variant="primary" isPending={submitting} onPress={() => submit(close)} data-cy="shelly-add-submit">
                    <PlusIcon className="h-4 w-4" /> Add device
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

function TextFieldRow({
  label,
  value,
  onChange,
  placeholder,
  required,
  dataCy,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  dataCy?: string;
}) {
  return (
    <TextField value={value} onChange={onChange} isRequired={required}>
      <Label>{label}</Label>
      <Input placeholder={placeholder} autoComplete="off" data-cy={dataCy} />
    </TextField>
  );
}

export function DevicesPage() {
  const [devices, setDevices] = useState<ShellyDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);
  const { isOpen, open, setOpen } = useOverlayState();

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
          <WifiIcon className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Shelly Devices</h1>
            <p className="mt-1 text-sm text-foreground-500">Discovered and manually added Shelly devices.</p>
          </div>
        </div>
        <Button variant="primary" onPress={open} data-cy="shelly-add-open">
          <PlusIcon className="h-4 w-4" /> Add device
        </Button>
      </div>

      {loadError && (
        <Alert status="danger">
          <AlertContent>
            <AlertDescription>Failed to load devices: {loadError}</AlertDescription>
          </AlertContent>
        </Alert>
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
                      <div className="font-medium text-default-800">{device.name}</div>
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

      <AddDeviceModal isOpen={isOpen} onOpenChange={setOpen} onAdded={refresh} />
    </div>
  );
}
