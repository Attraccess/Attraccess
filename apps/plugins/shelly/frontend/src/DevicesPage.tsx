// Shelly device registry UI. Laid out like the host's other management pages
// (e.g. MQTT servers): a page header with a primary action, the devices in a
// compact single-line Table, and drawers for add / info / admin password.
// Built from the host's shared HeroUI kit so it inherits the app theme.
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIndicator,
  Button,
  Card,
  Chip,
  Description,
  DrawerBackdrop,
  DrawerBody,
  DrawerContent,
  DrawerDialog,
  DrawerFooter,
  DrawerHeader,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownTrigger,
  Form,
  Input,
  InputGroup,
  Label,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  TextField,
  Tooltip,
  useOverlayState,
} from '@heroui/react';
import {
  AlertCircleIcon,
  EyeIcon,
  EyeOffIcon,
  InfoIcon,
  KeyRoundIcon,
  MehIcon,
  MoreVerticalIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  TriangleAlertIcon,
  WifiIcon,
  XIcon,
} from 'lucide-react';
import { useCallback, useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
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
    <Chip variant="soft" color={color} size="sm" className="whitespace-nowrap">
      {label}
    </Chip>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (Array.isArray(value)) return value[Number(key)];
    return isRecord(value) ? value[key] : undefined;
  }, source);
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

// Mirror of the host's <Alert status="danger"> + AlertStatusIcon pairing.
function ErrorAlert({ children, dataCy }: { children: ReactNode; dataCy?: string }) {
  return (
    <Alert status="danger">
      <AlertIndicator>
        <AlertCircleIcon />
      </AlertIndicator>
      <AlertContent>
        <AlertDescription data-cy={dataCy}>{children}</AlertDescription>
      </AlertContent>
    </Alert>
  );
}

function DrawerTitle({ title, subtitle, onClose }: { title: string; subtitle?: ReactNode; onClose: () => void }) {
  return (
    <div className="flex w-full items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="truncate text-lg font-semibold">{title}</h2>
        {subtitle && <div className="text-sm text-default-500">{subtitle}</div>}
      </div>
      <Button isIconOnly variant="ghost" aria-label="Close" onPress={onClose}>
        <XIcon size={16} />
      </Button>
    </div>
  );
}

// Mirror of the host's PasswordInput (visibility toggle in an InputGroup suffix);
// not importable across the federation boundary.
function PasswordField({
  label,
  value,
  onChange,
  description,
  required,
  autoComplete = 'off',
  dataCy,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  description?: string;
  required?: boolean;
  autoComplete?: string;
  dataCy?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField value={value} onChange={onChange} isRequired={required} className="w-full">
      <Label>{label}</Label>
      <InputGroup>
        <InputGroup.Input type={visible ? 'text' : 'password'} autoComplete={autoComplete} data-cy={dataCy} />
        <InputGroup.Suffix>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={visible ? 'Hide password' : 'Show password'}
            onPress={() => setVisible((v) => !v)}
          >
            {visible ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
          </Button>
        </InputGroup.Suffix>
      </InputGroup>
      {description && <Description>{description}</Description>}
    </TextField>
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

  useEffect(() => {
    if (isOpen) {
      setIpAddress('');
      setName('');
      setError(null);
    }
  }, [isOpen]);

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
      onAdded();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [ipAddress, name, onAdded, close]);

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submit();
    },
    [submit]
  );

  return (
    <StandardDrawer isOpen={isOpen} onOpenChange={onOpenChange}>
      <DrawerHeader>
        <DrawerTitle title="Add a device" subtitle="Register a Shelly relay or dimmer by its IP address." onClose={close} />
      </DrawerHeader>
      <DrawerBody>
        <Form onSubmit={onSubmit} className="flex flex-col gap-4">
          <TextField value={ipAddress} onChange={setIpAddress} isRequired className="w-full">
            <Label>IP address</Label>
            <Input placeholder="192.168.1.42" autoComplete="off" data-cy="shelly-add-ip" />
            <Description>We probe the device to detect its generation and model.</Description>
          </TextField>
          <TextField value={name} onChange={setName} className="w-full">
            <Label>Name</Label>
            <Input placeholder="Workshop light" autoComplete="off" data-cy="shelly-add-name" />
            <Description>Optional — defaults to the name reported by the device.</Description>
          </TextField>
          {error && <ErrorAlert dataCy="shelly-add-error">{error}</ErrorAlert>}
          <input type="submit" hidden />
        </Form>
      </DrawerBody>
      <DrawerFooter>
        <Button variant="secondary" onPress={close}>
          Cancel
        </Button>
        <Button variant="primary" isPending={submitting} onPress={submit} data-cy="shelly-add-submit">
          <PlusIcon className="h-4 w-4" /> Add device
        </Button>
      </DrawerFooter>
    </StandardDrawer>
  );
}

function DeviceChips({ device }: { device: ShellyDevice }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip variant="soft" size="sm" className="whitespace-nowrap">
        {generationLabel(device.generation)}
      </Chip>
      {device.model && (
        <Chip variant="soft" size="sm" className="max-w-40 truncate">
          {device.model}
        </Chip>
      )}
      <AuthChip state={device.authState} />
    </div>
  );
}

function InfoDrawer({ device, onOpenChange }: { device: ShellyDevice | null; onOpenChange: (open: boolean) => void }) {
  const [info, setInfo] = useState<ShellyDeviceInfo | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (device) {
      setInfo(null);
      setCurrentPassword('');
      setError(null);
    }
  }, [device]);

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

  // Auto-load only when the drawer opens for a device that doesn't need a
  // password (a protected fetch without credentials is guaranteed to fail).
  // Deliberately not keyed on `load`, which changes on every password
  // keystroke; manual refresh covers the rest.
  useEffect(() => {
    if (device && device.authState !== 'required') void load();
  }, [device]);

  return (
    <StandardDrawer isOpen={!!device} onOpenChange={onOpenChange}>
      <DrawerHeader>
        <DrawerTitle
          title={device?.name ?? 'Device info'}
          subtitle={device && <div className="flex flex-col gap-2"><span>{device.ipAddress}</span><DeviceChips device={device} /></div>}
          onClose={close}
        />
      </DrawerHeader>
      <DrawerBody>
        <div className="flex flex-col gap-4">
          {device?.authState === 'required' && (
            <Card className="border-l-4 border-l-warning bg-warning/5">
              <Card.Content className="p-4">
                <Form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void load();
                  }}
                  className="flex flex-col gap-3"
                >
                  <p className="text-sm">
                    This device requires authentication. Enter its admin password to read protected info.
                  </p>
                  <PasswordField
                    label="Admin password"
                    value={currentPassword}
                    onChange={setCurrentPassword}
                    autoComplete="current-password"
                    dataCy="shelly-info-current-password"
                  />
                  <div className="flex justify-end">
                    <Button
                      variant="primary"
                      size="sm"
                      isPending={loading}
                      onPress={() => void load()}
                      data-cy="shelly-info-unlock"
                    >
                      Load info
                    </Button>
                  </div>
                  <input type="submit" hidden />
                </Form>
              </Card.Content>
            </Card>
          )}
          {error && <ErrorAlert>{error}</ErrorAlert>}
          {loading && !info ? (
            <div className="flex flex-col gap-4" aria-hidden="true">
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          ) : (
            <DeviceInfoDetails info={info} />
          )}
        </div>
      </DrawerBody>
      <DrawerFooter>
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-xs text-default-500">
            {info ? `Updated ${new Date(info.fetchedAt).toLocaleTimeString()}` : ''}
          </span>
          <Button variant="secondary" onPress={load} isPending={loading} data-cy="shelly-info-refresh">
            <RefreshCwIcon className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </DrawerFooter>
    </StandardDrawer>
  );
}

function AuthDrawer({
  device,
  onOpenChange,
  onSaved,
}: {
  device: ShellyDevice | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
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

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submit();
    },
    [submit]
  );

  return (
    <StandardDrawer isOpen={!!device} onOpenChange={onOpenChange}>
      <DrawerHeader>
        <DrawerTitle
          title="Admin password"
          subtitle={device ? `Set or change the admin password of ${device.name} (${device.ipAddress}).` : undefined}
          onClose={close}
        />
      </DrawerHeader>
      <DrawerBody>
        <Form onSubmit={onSubmit} className="flex flex-col gap-4">
          {device?.authState === 'required' && (
            <PasswordField
              label="Current password"
              value={currentPassword}
              onChange={setCurrentPassword}
              description="Required because this device already has authentication enabled."
              autoComplete="current-password"
              dataCy="shelly-auth-current-password"
            />
          )}
          <PasswordField
            label="New admin password"
            value={password}
            onChange={setPassword}
            description="Protects the device's local web interface and API."
            required
            autoComplete="new-password"
            dataCy="shelly-auth-password"
          />
          {error && <ErrorAlert dataCy="shelly-auth-error">{error}</ErrorAlert>}
          <input type="submit" hidden />
        </Form>
      </DrawerBody>
      <DrawerFooter>
        <Button variant="secondary" onPress={close}>
          Cancel
        </Button>
        <Button variant="primary" isPending={submitting} onPress={submit} data-cy="shelly-auth-submit">
          <KeyRoundIcon className="h-4 w-4" /> Save password
        </Button>
      </DrawerFooter>
    </StandardDrawer>
  );
}

export function DeviceInfoDetails({ info }: { info: ShellyDeviceInfo | null }) {
  if (!info) {
    return (
      <div className="rounded-xl border border-dashed border-default-300 p-4 text-sm text-default-500">
        No device info loaded yet.
      </div>
    );
  }

  const status = info.status;
  const config = info.config;
  const output = firstValue(status, ['switch:0.output', 'relays.0.ison', 'lights.0.ison']);
  const power = firstValue(status, ['switch:0.apower', 'meters.0.power', 'lights.0.power']);
  const voltage = firstValue(status, ['switch:0.voltage', 'meters.0.voltage']);
  const current = firstValue(status, ['switch:0.current', 'meters.0.current']);

  const cards: Array<{ title: string; rows: Array<{ label: string; value: string }> }> = [
    {
      title: 'Device',
      rows: [
        { label: 'Name', value: formatValue(firstValue(config, ['sys.device.name', 'name', 'device.name'])) },
        { label: 'Generation', value: generationLabel(info.generation) },
        { label: 'Timezone', value: formatValue(firstValue(config, ['sys.location.tz', 'timezone'])) },
        { label: 'Uptime', value: formatUptime(firstValue(status, ['sys.uptime', 'uptime'])) },
      ],
    },
    {
      title: 'Network',
      rows: [
        { label: 'IP address', value: formatValue(firstValue(status, ['wifi.sta_ip', 'wifi_sta.ip', 'sta_ip'])) },
        { label: 'Wi-Fi network', value: formatValue(firstValue(status, ['wifi.ssid', 'wifi_sta.ssid', 'ssid'])) },
        { label: 'Signal', value: formatValue(firstValue(status, ['wifi.rssi', 'wifi_sta.rssi']), ' dBm') },
      ],
    },
    {
      title: 'Output',
      rows: [
        { label: 'State', value: formatValue(output) },
        { label: 'Power', value: formatValue(power, ' W') },
        { label: 'Voltage', value: formatValue(voltage, ' V') },
        { label: 'Current', value: formatValue(current, ' A') },
      ],
    },
  ];

  return (
    <div className="grid gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <Card.Header className="pb-0">
            <span className="text-sm font-semibold">{card.title}</span>
          </Card.Header>
          <Card.Content>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {card.rows.map((row) => (
                <div key={row.label} className="min-w-0">
                  <dt className="text-xs font-medium uppercase tracking-wide text-default-500">{row.label}</dt>
                  <dd className="mt-1 truncate text-sm text-default-800" title={row.value}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Card.Content>
        </Card>
      ))}
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

function EmptyDevices({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-12">
      <MehIcon size={36} className="text-default-300" />
      <p className="text-sm text-default-500">No devices yet. Add your first Shelly by its IP address.</p>
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
  const { isOpen, open, setOpen } = useOverlayState();

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

      {pageError && <ErrorAlert>{pageError}</ErrorAlert>}

      {loading ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ) : (
        <Table data-cy="shelly-device-table">
          <TableScrollContainer>
            <TableContent aria-label="Shelly devices">
              <TableHeader>
                <TableColumn isRowHeader>Device</TableColumn>
                {/* The sidebar appears at md and reclaims ~256px, so the content area is
                    narrower at md than at sm — the Address column ducks out again there. */}
                <TableColumn className="hidden sm:table-cell md:hidden lg:table-cell">Address</TableColumn>
                <TableColumn className="hidden lg:table-cell">Model</TableColumn>
                <TableColumn className="hidden sm:table-cell">Auth</TableColumn>
                <TableColumn className="text-end">Actions</TableColumn>
              </TableHeader>
              <TableBody items={devices} renderEmptyState={() => <EmptyDevices onAdd={open} />}>
                {(device) => (
                  <TableRow key={device.id} id={device.id} data-cy={`shelly-device-row-${device.id}`}>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <span className="max-w-36 truncate font-medium text-default-800 sm:max-w-48" title={device.name}>
                          {device.name}
                        </span>
                        {device.lastProbeError && <ProbeErrorIndicator message={device.lastProbeError} />}
                      </div>
                      {/* Where the Address column is hidden, surface the IP here instead. */}
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

      <AddDeviceDrawer isOpen={isOpen} onOpenChange={setOpen} onAdded={refresh} />
      <InfoDrawer device={infoDevice} onOpenChange={(openInfo) => !openInfo && setInfoDevice(null)} />
      <AuthDrawer device={authDevice} onOpenChange={(openAuth) => !openAuth && setAuthDevice(null)} onSaved={refresh} />

      <Modal
        isOpen={!!deleteTarget}
        onOpenChange={(openModal) => {
          if (!openModal) setDeleteTarget(null);
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
