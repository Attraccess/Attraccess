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
  DrawerBackdrop,
  DrawerBody,
  DrawerContent,
  DrawerDialog,
  DrawerHeader,
  Form,
  Input,
  Label,
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
import { InfoIcon, KeyRoundIcon, MehIcon, PlusIcon, RefreshCwIcon, Trash2Icon, WifiIcon, XIcon } from 'lucide-react';
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  addDevice,
  deleteDevice,
  getDeviceInfo,
  listDevices,
  reprobeDevice,
  setAdminPassword,
  type AuthState,
  type ShellyDevice,
  type ShellyDeviceInfo,
} from './api';

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
    <Chip variant="soft" color={color} className="whitespace-nowrap">
      {label}
    </Chip>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (isRecord(value) ? value[key] : undefined), source);
}

function firstValue(source: unknown, paths: string[]): unknown {
  for (const path of paths) {
    const value = readPath(source, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function formatValue(value: unknown, suffix = ''): string {
  if (value === undefined || value === null || value === '') return 'Not reported';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (typeof value === 'number') return `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`;
  return String(value);
}

function formatUptime(seconds: unknown): string {
  if (typeof seconds !== 'number') return formatValue(seconds);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function DetailCard({ title, rows }: { title: string; rows: Array<{ label: string; value: string }> }) {
  return (
    <section className="rounded-xl border border-default-200 bg-surface p-4">
      <h3 className="text-sm font-semibold text-default-800">{title}</h3>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-xs font-medium uppercase tracking-wide text-default-500">{row.label}</dt>
            <dd className="mt-1 truncate text-sm text-default-800" title={row.value}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
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

// Mirror of the host's StandardDrawer (apps/frontend/src/components/standardDrawer.tsx),
// replicated here because host components aren't shared with plugins over module
// federation — only @heroui/react primitives are.
const DRAWER_DIALOG_CLASSNAME = 'md:max-w-2xl md:mx-auto bg-surface-secondary';
const FIELD_CONTRAST_STYLE: CSSProperties = {
  ['--field-border' as never]: 'var(--border-secondary)',
  ['--border-width-field' as never]: '1px',
};

function StandardDrawer({
  isOpen,
  onOpenChange,
  children,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <DrawerBackdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerDialog className={DRAWER_DIALOG_CLASSNAME} style={FIELD_CONTRAST_STYLE}>
          {children}
        </DrawerDialog>
      </DrawerContent>
    </DrawerBackdrop>
  );
}

function AddDeviceDrawer({
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

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const submit = useCallback(async () => {
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
  }, [ipAddress, name, onAdded, close]);

  return (
    <StandardDrawer isOpen={isOpen} onOpenChange={onOpenChange}>
      <DrawerHeader>
        <div className="flex w-full items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">Add a device</h2>
            <p className="text-sm text-default-500">
              Enter the device's IP address. We probe <code>GET /shelly</code> to detect its generation and model.
            </p>
          </div>
          <Button isIconOnly variant="ghost" aria-label="Close" onPress={close}>
            <XIcon size={16} />
          </Button>
        </div>
      </DrawerHeader>
      <DrawerBody>
        <Form onSubmit={submit} className="flex flex-col gap-4">
          <TextFieldRow label="IP address" value={ipAddress} onChange={setIpAddress} placeholder="192.168.1.42" required dataCy="shelly-add-ip" />
          <TextFieldRow label="Name (optional)" value={name} onChange={setName} placeholder="Workshop light" dataCy="shelly-add-name" />
          {error && (
            <Alert status="danger">
              <AlertContent>
                <AlertDescription data-cy="shelly-add-error">{error}</AlertDescription>
              </AlertContent>
            </Alert>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onPress={close}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isPending={submitting} onPress={submit} data-cy="shelly-add-submit">
              <PlusIcon className="h-4 w-4" /> Add device
            </Button>
          </div>
          <input type="submit" hidden />
        </Form>
      </DrawerBody>
    </StandardDrawer>
  );
}

function TextFieldRow({
  label,
  value,
  onChange,
  placeholder,
  required,
  dataCy,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  dataCy?: string;
  type?: string;
}) {
  return (
    <TextField value={value} onChange={onChange} isRequired={required}>
      <Label>{label}</Label>
      <Input type={type} placeholder={placeholder} autoComplete="off" data-cy={dataCy} />
    </TextField>
  );
}

function InfoDrawer({ device, onOpenChange }: { device: ShellyDevice | null; onOpenChange: (open: boolean) => void }) {
  const [info, setInfo] = useState<ShellyDeviceInfo | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const load = useCallback(async () => {
    if (!device) return;
    setLoading(true);
    setError(null);
    try {
      setInfo(await getDeviceInfo(device.id, { currentPassword: currentPassword || undefined }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [device, currentPassword]);

  useEffect(() => {
    if (device) void load();
  }, [device, load]);

  return (
    <StandardDrawer isOpen={!!device} onOpenChange={onOpenChange}>
      <DrawerHeader>
        <div className="flex w-full items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">Device info</h2>
            <p className="text-sm text-default-500">Live status and config from {device?.ipAddress}.</p>
          </div>
          <Button isIconOnly variant="ghost" aria-label="Close" onPress={close}>
            <XIcon size={16} />
          </Button>
        </div>
      </DrawerHeader>
      <DrawerBody>
        <div className="flex flex-col gap-4">
          {device?.authState === 'required' && (
            <div className="flex flex-col gap-3 rounded-lg border border-warning-200 bg-warning-50 p-3">
              <p className="text-sm text-warning-700">This device requires authentication. Enter the current admin password to refresh protected info.</p>
              <TextFieldRow label="Current password" value={currentPassword} onChange={setCurrentPassword} type="password" dataCy="shelly-info-current-password" />
            </div>
          )}
          {error && (
            <Alert status="danger">
              <AlertContent>
                <AlertDescription>{error}</AlertDescription>
              </AlertContent>
            </Alert>
          )}
          <div className="flex justify-end">
            <Button variant="secondary" onPress={load} isPending={loading} data-cy="shelly-info-refresh">
              <RefreshCwIcon className="h-4 w-4" /> Refresh info
            </Button>
          </div>
          {loading && !info ? (
            <div className="flex items-center justify-center p-6">
              <Spinner color="accent" />
            </div>
          ) : (
            <DeviceInfoDetails info={info} />
          )}
        </div>
      </DrawerBody>
    </StandardDrawer>
  );
}

function AuthDrawer({ device, onOpenChange, onSaved }: { device: ShellyDevice | null; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (device) {
      setCurrentPassword('');
      setPassword('');
      setError(null);
    }
  }, [device]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const submit = useCallback(async () => {
    if (!device) return;
    const nextPassword = password.trim();
    if (!nextPassword) {
      setError('New password is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await setAdminPassword(device.id, { currentPassword: currentPassword || undefined, password: nextPassword });
      onSaved();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [close, currentPassword, device, onSaved, password]);

  return (
    <StandardDrawer isOpen={!!device} onOpenChange={onOpenChange}>
      <DrawerHeader>
        <div className="flex w-full items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">Admin password</h2>
            <p className="text-sm text-default-500">Set or change the Shelly admin password for {device?.name}.</p>
          </div>
          <Button isIconOnly variant="ghost" aria-label="Close" onPress={close}>
            <XIcon size={16} />
          </Button>
        </div>
      </DrawerHeader>
      <DrawerBody>
        <Form onSubmit={submit} className="flex flex-col gap-4">
          {device?.authState === 'required' && (
            <TextFieldRow label="Current password" value={currentPassword} onChange={setCurrentPassword} type="password" dataCy="shelly-auth-current-password" />
          )}
          <TextFieldRow label="New admin password" value={password} onChange={setPassword} type="password" required dataCy="shelly-auth-password" />
          {error && (
            <Alert status="danger">
              <AlertContent>
                <AlertDescription data-cy="shelly-auth-error">{error}</AlertDescription>
              </AlertContent>
            </Alert>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onPress={close}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isPending={submitting} onPress={submit} data-cy="shelly-auth-submit">
              <KeyRoundIcon className="h-4 w-4" /> Save password
            </Button>
          </div>
          <input type="submit" hidden />
        </Form>
      </DrawerBody>
    </StandardDrawer>
  );
}

export function DeviceInfoDetails({ info }: { info: ShellyDeviceInfo | null }) {
  if (!info) {
    return <div className="rounded-xl border border-dashed border-default-300 p-4 text-sm text-default-500">No device info loaded yet.</div>;
  }

  const status = info.status;
  const config = info.config;
  const output = firstValue(status, ['switch_0.output', 'relays.0.ison', 'lights.0.ison']);
  const power = firstValue(status, ['switch_0.apower', 'meters.0.power', 'lights.0.power']);
  const voltage = firstValue(status, ['switch_0.voltage', 'meters.0.voltage']);
  const current = firstValue(status, ['switch_0.current', 'meters.0.current']);

  return (
    <div className="grid gap-4">
      <DetailCard
        title="Device"
        rows={[
          { label: 'Name', value: formatValue(firstValue(config, ['sys.device.name', 'name', 'device.name'])) },
          { label: 'Generation', value: generationLabel(info.generation) },
          { label: 'Fetched', value: new Date(info.fetchedAt).toLocaleString() },
          { label: 'Timezone', value: formatValue(firstValue(config, ['sys.location.tz', 'timezone'])) },
        ]}
      />
      <DetailCard
        title="Network"
        rows={[
          { label: 'IP address', value: formatValue(firstValue(status, ['wifi.sta_ip', 'wifi_sta.ip', 'sta_ip'])) },
          { label: 'Wi-Fi network', value: formatValue(firstValue(status, ['wifi.ssid', 'wifi_sta.ssid', 'ssid'])) },
          { label: 'Signal', value: formatValue(firstValue(status, ['wifi.rssi', 'wifi_sta.rssi']), ' dBm') },
          { label: 'Uptime', value: formatUptime(firstValue(status, ['sys.uptime', 'uptime'])) },
        ]}
      />
      <DetailCard
        title="Output"
        rows={[
          { label: 'State', value: formatValue(output) },
          { label: 'Power', value: formatValue(power, ' W') },
          { label: 'Voltage', value: formatValue(voltage, ' V') },
          { label: 'Current', value: formatValue(current, ' A') },
        ]}
      />
    </div>
  );
}

export function RowActions({
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
    <div className="flex flex-row justify-end gap-0 whitespace-nowrap">
      <Button variant="ghost" size="sm" isIconOnly className="h-7 w-7 min-w-7" aria-label="View device info" isDisabled={isBusy} onPress={onInfo} data-cy={`shelly-device-info-${deviceId}`}>
        <InfoIcon className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" isIconOnly className="h-7 w-7 min-w-7" aria-label="Set admin password" isDisabled={isBusy} onPress={onAuth} data-cy={`shelly-device-auth-${deviceId}`}>
        <KeyRoundIcon className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" isIconOnly className="h-7 w-7 min-w-7" aria-label="Re-probe device" isDisabled={isBusy} onPress={onReprobe} data-cy={`shelly-device-reprobe-${deviceId}`}>
        <RefreshCwIcon className="h-4 w-4" />
      </Button>
      <Button variant="danger-soft" size="sm" isIconOnly className="h-7 w-7 min-w-7" aria-label="Delete device" isDisabled={isBusy} onPress={onDelete} data-cy={`shelly-device-delete-${deviceId}`}>
        <Trash2Icon className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function DevicesPage() {
  const [devices, setDevices] = useState<ShellyDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);
  const [infoDevice, setInfoDevice] = useState<ShellyDevice | null>(null);
  const [authDevice, setAuthDevice] = useState<ShellyDevice | null>(null);
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
                <TableColumn className="hidden md:table-cell">Address</TableColumn>
                <TableColumn className="hidden md:table-cell">Generation</TableColumn>
                <TableColumn className="hidden md:table-cell">Model</TableColumn>
                <TableColumn className="hidden md:table-cell">Auth</TableColumn>
                <TableColumn>Actions</TableColumn>
              </TableHeader>
              <TableBody items={devices} renderEmptyState={() => <EmptyDevices />}>
                {(device) => (
                  <TableRow key={device.id} id={device.id} data-cy={`shelly-device-row-${device.id}`}>
                    <TableCell className="whitespace-nowrap">
                      <div className="max-w-48 truncate font-medium text-default-800" title={device.name}>{device.name}</div>
                      {device.lastProbeError && (
                        <div className="max-w-48 truncate text-xs text-danger" title={device.lastProbeError} data-cy="shelly-device-probe-error">
                          Probe failed: {device.lastProbeError}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap md:table-cell">{device.ipAddress}</TableCell>
                    <TableCell className="hidden whitespace-nowrap md:table-cell">{generationLabel(device.generation)}</TableCell>
                    <TableCell className="hidden whitespace-nowrap md:table-cell">
                      <span className="block max-w-36 truncate" title={device.model ?? undefined}>{device.model ?? '—'}</span>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap md:table-cell">
                      <AuthChip state={device.authState} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <RowActions
                        deviceId={device.id}
                        isBusy={rowBusyId === device.id}
                        onInfo={() => setInfoDevice(device)}
                        onAuth={() => setAuthDevice(device)}
                        onReprobe={() => withRowBusy(device.id, () => reprobeDevice(device.id))}
                        onDelete={() => withRowBusy(device.id, () => deleteDevice(device.id))}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </TableContent>
          </TableScrollContainer>
        </Table>
      )}

      <AddDeviceDrawer isOpen={isOpen} onOpenChange={setOpen} onAdded={refresh} />
      <InfoDrawer device={infoDevice} onOpenChange={(openInfo) => !openInfo && setInfoDevice(null)} />
      <AuthDrawer device={authDevice} onOpenChange={(openAuth) => !openAuth && setAuthDevice(null)} onSaved={refresh} />
    </div>
  );
}
