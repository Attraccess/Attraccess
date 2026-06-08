// Shelly device registry UI: an add-by-IP form plus the persisted device list.
// Built from the host's shared HeroUI kit so it inherits the app's theme.
import {
  Alert,
  AlertContent,
  AlertDescription,
  Button,
  Card,
  Chip,
  Form,
  Input,
  Label,
  Spinner,
  TextField,
} from '@heroui/react';
import { PlusIcon, RefreshCwIcon, Trash2Icon, WifiIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { addDevice, deleteDevice, listDevices, reprobeDevice, type AuthState, type ShellyDevice } from './api';

function generationLabel(generation: number | null): string {
  if (generation === null) return 'Unknown';
  return generation === 1 ? 'Gen 1' : `Gen ${generation}+`;
}

function authChipColor(state: AuthState): 'success' | 'warning' | 'default' {
  if (state === 'none') return 'success';
  if (state === 'required') return 'warning';
  return 'default';
}

function authLabel(state: AuthState): string {
  if (state === 'none') return 'No auth';
  if (state === 'required') return 'Auth required';
  return 'Auth unknown';
}

function DeviceRow({
  device,
  busy,
  onReprobe,
  onDelete,
}: {
  device: ShellyDevice;
  busy: boolean;
  onReprobe: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      data-cy={`shelly-device-row-${device.id}`}
      className="flex flex-col gap-3 border-b border-default-200 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-col gap-1">
        <span className="font-medium text-default-800">{device.name}</span>
        <span className="text-sm text-default-500">{device.ipAddress}</span>
        {device.lastProbeError && (
          <span className="text-xs text-danger" data-cy="shelly-device-probe-error">
            Last probe failed: {device.lastProbeError}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip variant="soft" color="default">
          {generationLabel(device.generation)}
        </Chip>
        {device.model && (
          <Chip variant="soft" color="accent">
            {device.model}
          </Chip>
        )}
        <Chip variant="soft" color={authChipColor(device.authState)}>
          {authLabel(device.authState)}
        </Chip>
        <Button
          size="sm"
          variant="secondary"
          isDisabled={busy}
          onPress={() => onReprobe(device.id)}
          data-cy={`shelly-device-reprobe-${device.id}`}
        >
          <RefreshCwIcon className="h-4 w-4" /> Re-probe
        </Button>
        <Button
          size="sm"
          variant="ghost"
          isDisabled={busy}
          onPress={() => onDelete(device.id)}
          data-cy={`shelly-device-delete-${device.id}`}
        >
          <Trash2Icon className="h-4 w-4" /> Delete
        </Button>
      </div>
    </div>
  );
}

export function DevicesPage() {
  const [devices, setDevices] = useState<ShellyDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [ipAddress, setIpAddress] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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

  const onAdd = useCallback(async () => {
    const ip = ipAddress.trim();
    if (!ip) {
      setFormError('IP address is required.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await addDevice({ ipAddress: ip, name: name.trim() || undefined });
      setIpAddress('');
      setName('');
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [ipAddress, name, refresh]);

  const onReprobe = useCallback(
    async (id: number) => {
      setRowBusyId(id);
      try {
        await reprobeDevice(id);
        await refresh();
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        setRowBusyId(null);
      }
    },
    [refresh]
  );

  const onDelete = useCallback(
    async (id: number) => {
      setRowBusyId(id);
      try {
        await deleteDevice(id);
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
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <WifiIcon className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold text-default-800">Shelly Devices</h1>
      </div>

      <Card className="border border-default-200 dark:border-default-100">
        <Card.Header className="flex flex-col items-start gap-1">
          <p className="text-base font-semibold text-default-700">Add a device</p>
          <p className="text-sm text-default-500">
            Enter the device's IP address. We probe <code>GET /shelly</code> to detect its generation and model.
          </p>
        </Card.Header>
        <Card.Content>
          <Form ref={formRef} onSubmit={onAdd} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <TextField value={ipAddress} onChange={setIpAddress} isRequired className="flex-1">
              <Label>IP address</Label>
              <Input placeholder="192.168.1.42" autoComplete="off" data-cy="shelly-add-ip" />
            </TextField>
            <TextField value={name} onChange={setName} className="flex-1">
              <Label>Name (optional)</Label>
              <Input placeholder="Workshop light" autoComplete="off" data-cy="shelly-add-name" />
            </TextField>
            <Button
              type="submit"
              variant="primary"
              isDisabled={submitting}
              onPress={onAdd}
              data-cy="shelly-add-submit"
            >
              <PlusIcon className="h-4 w-4" /> {submitting ? 'Adding…' : 'Add device'}
            </Button>
          </Form>
          {formError && (
            <Alert status="danger" className="mt-4">
              <AlertContent>
                <AlertDescription data-cy="shelly-add-error">{formError}</AlertDescription>
              </AlertContent>
            </Alert>
          )}
        </Card.Content>
      </Card>

      <Card className="border border-default-200 dark:border-default-100">
        <Card.Header>
          <p className="text-base font-semibold text-default-700">Devices</p>
        </Card.Header>
        <Card.Content>
          {loading && (
            <div className="flex items-center gap-2 text-default-500">
              <Spinner size="sm" /> Loading…
            </div>
          )}
          {!loading && loadError && (
            <Alert status="danger">
              <AlertContent>
                <AlertDescription>Failed to load devices: {loadError}</AlertDescription>
              </AlertContent>
            </Alert>
          )}
          {!loading && !loadError && devices.length === 0 && (
            <p className="text-sm text-default-500" data-cy="shelly-empty">
              No devices yet. Add one by IP above.
            </p>
          )}
          {!loading && !loadError && devices.length > 0 && (
            <div data-cy="shelly-device-list" className="flex flex-col">
              {devices.map((device) => (
                <DeviceRow
                  key={device.id}
                  device={device}
                  busy={rowBusyId === device.id}
                  onReprobe={onReprobe}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}
