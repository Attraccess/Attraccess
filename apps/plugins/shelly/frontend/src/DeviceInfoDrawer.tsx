// Device info drawer (ATT-498): reads Shelly Gen 1/2+ status + config from the
// device via the plugin backend and renders a summary card grid.
import { Button, Card, DrawerBody, DrawerFooter, DrawerHeader, Form, Skeleton } from '@heroui/react';
import { EyeIcon, EyeOffIcon, InfoIcon, RefreshCwIcon, XIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { getDeviceInfo, type AuthState, type ShellyDevice, type ShellyDeviceInfo } from './api';
import { StandardDrawer, TextFieldRow } from './drawer';
import { StatusAlert } from './StatusAlert';

function generationLabel(generation: number | null): string {
  if (generation === null) return 'Unknown';
  return generation === 1 ? 'Gen 1' : `Gen ${generation}+`;
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

function AuthProtectedForm({
  authState,
  currentPassword,
  onChange,
  loading,
  onLoad,
}: {
  authState: AuthState;
  currentPassword: string;
  onChange: (v: string) => void;
  loading: boolean;
  onLoad: () => void;
}) {
  const [visible, setVisible] = useState(false);

  if (authState !== 'required') return null;

  return (
    <div className="sh:rounded-md sh:border-l-4 sh:border-l-warning sh:bg-warning/5 sh:p-4">
      <Form
        onSubmit={(e) => {
          e.preventDefault();
          onLoad();
        }}
        className="sh:flex sh:flex-col sh:gap-3"
      >
        <p className="sh:text-sm">
          This device requires authentication. Enter its admin password to read protected info.
        </p>
        <div className="sh:relative">
          <TextFieldRow
            label="Admin password"
            value={currentPassword}
            onChange={onChange}
            placeholder="device admin password"
            dataCy="shelly-info-current-password"
          />
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label={visible ? 'Hide password' : 'Show password'}
            className="sh:absolute sh:right-1 sh:top-6"
            onPress={() => setVisible((v) => !v)}
          >
            {visible ? <EyeOffIcon className="sh:h-4 sh:w-4" /> : <EyeIcon className="sh:h-4 sh:w-4" />}
          </Button>
        </div>
        <div className="sh:flex sh:justify-end">
          <Button variant="primary" size="sm" isPending={loading} onPress={onLoad} data-cy="shelly-info-unlock">
            Load info
          </Button>
        </div>
        <input type="submit" hidden />
      </Form>
    </div>
  );
}

export function DeviceInfoCards({ info }: { info: ShellyDeviceInfo }) {
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
    <div className="sh:grid sh:gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <Card.Header className="sh:pb-0">
            <span className="sh:text-sm sh:font-semibold">{card.title}</span>
          </Card.Header>
          <Card.Content>
            <dl className="sh:grid sh:grid-cols-1 sh:gap-3 sh:sm:grid-cols-2">
              {card.rows.map((row) => (
                <div key={row.label} className="sh:min-w-0">
                  <dt className="sh:text-xs sh:font-medium sh:uppercase sh:tracking-wide sh:text-default-500">
                    {row.label}
                  </dt>
                  <dd className="sh:mt-1 sh:truncate sh:text-sm sh:text-default-800" title={row.value}>
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

export function DeviceInfoDrawer({
  device,
  onOpenChange,
}: {
  device: ShellyDevice | null;
  onOpenChange: (open: boolean) => void;
}) {
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
  useEffect(() => {
    if (device && device.authState !== 'required') void load();
  }, [device]); // ponytail: intentionally omit `load` — it changes on every password keystroke; auto-load only on device open

  return (
    <StandardDrawer isOpen={!!device} onOpenChange={onOpenChange}>
      <DrawerHeader>
        <div className="sh:flex sh:w-full sh:items-start sh:justify-between sh:gap-3">
          <div className="sh:flex sh:min-w-0 sh:flex-col sh:gap-1">
            <div className="sh:flex sh:items-center sh:gap-2">
              <InfoIcon className="sh:h-5 sh:w-5 sh:shrink-0 sh:text-accent-soft-foreground" />
              <h2 className="sh:text-lg sh:font-semibold">{device?.name ?? 'Device info'}</h2>
            </div>
            {device && <p className="sh:text-sm sh:text-muted">{device.ipAddress}</p>}
          </div>
          <Button isIconOnly variant="ghost" aria-label="Close" onPress={close}>
            <XIcon size={16} />
          </Button>
        </div>
      </DrawerHeader>
      <DrawerBody>
        <div className="sh:flex sh:flex-col sh:gap-4">
          <AuthProtectedForm
            authState={device?.authState ?? 'unknown'}
            currentPassword={currentPassword}
            onChange={setCurrentPassword}
            loading={loading}
            onLoad={() => void load()}
          />
          {error && (
            <StatusAlert status="danger" title="Could not load device info">
              {error}
            </StatusAlert>
          )}
          {loading && !info ? (
            <div className="sh:flex sh:flex-col sh:gap-4" aria-hidden="true">
              <Skeleton className="sh:h-32 sh:w-full sh:rounded-xl" />
              <Skeleton className="sh:h-32 sh:w-full sh:rounded-xl" />
              <Skeleton className="sh:h-32 sh:w-full sh:rounded-xl" />
            </div>
          ) : info ? (
            <DeviceInfoCards info={info} />
          ) : null}
        </div>
      </DrawerBody>
      <DrawerFooter>
        <div className="sh:flex sh:w-full sh:items-center sh:justify-between sh:gap-3">
          <span className="sh:text-xs sh:text-default-500">
            {info ? `Updated ${new Date(info.fetchedAt).toLocaleTimeString()}` : ''}
          </span>
          <Button variant="secondary" onPress={() => void load()} isPending={loading} data-cy="shelly-info-refresh">
            <RefreshCwIcon className="sh:h-4 sh:w-4" /> Refresh
          </Button>
        </div>
      </DrawerFooter>
    </StandardDrawer>
  );
}
