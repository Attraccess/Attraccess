// Control and state for a paired Zigbee device (ATT-789).
//
// Everything here goes through zigbee2mqtt (`<base>/<ieee>/set` and the device's
// state topic) rather than the device's own MQTT client — a Zigbee device never
// gets device-side MQTT config, which is exactly the difference this drawer is
// meant to make obvious.
import { Button, Chip, DrawerBody, DrawerFooter, DrawerHeader, Spinner } from '@heroui/react';
import { PlugZapIcon, PowerIcon, RefreshCwIcon, UnlinkIcon, XIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { getZigbeeState, setZigbeeState, unpairDevice, type ShellyDevice, type ZigbeeDeviceState } from './api';
import { StandardDrawer } from './drawer';
import { StatusAlert } from './StatusAlert';

/** Fields worth showing as their own row; anything else lands in the raw block. */
const HIGHLIGHTED: { key: string; label: string; unit?: string }[] = [
  { key: 'state', label: 'State' },
  { key: 'power', label: 'Power', unit: 'W' },
  { key: 'voltage', label: 'Voltage', unit: 'V' },
  { key: 'current', label: 'Current', unit: 'A' },
  { key: 'energy', label: 'Energy', unit: 'kWh' },
  { key: 'linkquality', label: 'Link quality' },
];

function StateRows({ state }: { state: Record<string, unknown> }) {
  const rows = HIGHLIGHTED.filter(({ key }) => state[key] !== undefined && state[key] !== null);
  if (rows.length === 0) return null;

  return (
    <dl className="sh:grid sh:grid-cols-2 sh:gap-x-4 sh:gap-y-2" data-cy="shelly-zigbee-state-rows">
      {rows.map(({ key, label, unit }) => (
        <div key={key} className="sh:flex sh:flex-col">
          <dt className="sh:text-xs sh:text-muted">{label}</dt>
          <dd className="sh:text-sm sh:font-medium sh:text-default-800">
            {String(state[key])}
            {unit ? ` ${unit}` : ''}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ZigbeeControlDrawer({
  device,
  onOpenChange,
  onChanged,
}: {
  device: ShellyDevice | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<ZigbeeDeviceState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!device) return;
    setLoading(true);
    setError(null);
    try {
      setData(await getZigbeeState(device.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [device]);

  useEffect(() => {
    if (device) void refresh();
    else setData(null);
  }, [device, refresh]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const publish = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!device) return;
      setBusy(true);
      setError(null);
      try {
        await setZigbeeState(device.id, payload);
        // z2m publishes the new state asynchronously; give it a beat to land
        // before reading it back, so the drawer does not show the old value.
        await new Promise((resolve) => setTimeout(resolve, 500));
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [device, refresh]
  );

  const unpair = useCallback(async () => {
    if (!device) return;
    setBusy(true);
    setError(null);
    try {
      await unpairDevice(device.id);
      onChanged();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [close, device, onChanged]);

  const unsupported = data?.gatewayDevice !== null && data?.gatewayDevice?.supported === false;

  return (
    <StandardDrawer isOpen={!!device} onOpenChange={onOpenChange} label="Zigbee control">
      <DrawerHeader>
        <div className="sh:flex sh:w-full sh:items-start sh:justify-between sh:gap-3">
          <div className="sh:flex sh:min-w-0 sh:flex-col sh:gap-1">
            <div className="sh:flex sh:items-center sh:gap-2">
              <PlugZapIcon className="sh:h-5 sh:w-5 sh:shrink-0 sh:text-accent-soft-foreground" />
              <h2 className="sh:text-lg sh:font-semibold">Zigbee control</h2>
            </div>
            {device && (
              <p className="sh:text-sm sh:text-muted">
                {device.name} — controlled through zigbee2mqtt, not the device's own MQTT client.
              </p>
            )}
          </div>
          <Button isIconOnly variant="ghost" aria-label="Close" onPress={close}>
            <XIcon size={16} />
          </Button>
        </div>
      </DrawerHeader>
      <DrawerBody>
        {loading && !data ? (
          <div className="sh:flex sh:items-center sh:justify-center sh:p-6">
            <Spinner color="accent" />
          </div>
        ) : (
          <div className="sh:flex sh:flex-col sh:gap-4">
            <div className="sh:flex sh:flex-col sh:gap-2">
              <span className="sh:text-xs sh:font-medium sh:text-muted">Gateway link</span>
              <div className="sh:flex sh:flex-col sh:gap-1 sh:text-sm">
                <span className="sh:font-mono sh:text-xs sh:break-all sh:text-default-700" data-cy="shelly-zigbee-ieee">
                  {device?.zigbeeIeeeAddress}
                </span>
                <span className="sh:font-mono sh:text-xs sh:break-all sh:text-default-500">
                  {device?.zigbeeFriendlyName}
                </span>
              </div>
              {data?.gatewayDevice && (
                <div className="sh:flex sh:flex-wrap sh:gap-1.5">
                  <Chip variant="soft" size="sm">
                    {data.gatewayDevice.definition?.model ?? data.gatewayDevice.model_id ?? 'Unknown model'}
                  </Chip>
                  {data.gatewayDevice.definition?.vendor && (
                    <Chip variant="soft" size="sm">
                      {data.gatewayDevice.definition.vendor}
                    </Chip>
                  )}
                </div>
              )}
            </div>

            {unsupported && (
              <StatusAlert status="warning" title="Not supported by zigbee2mqtt" dataCy="shelly-zigbee-unsupported">
                zigbee2mqtt has no converter for this model, so it exposes no controls. The device is joined to the
                network, but switching it from here will not work until a converter exists upstream.
              </StatusAlert>
            )}

            {data?.gatewayDevice === null && (
              <StatusAlert status="warning" title="Unknown to the gateway" dataCy="shelly-zigbee-unknown">
                zigbee2mqtt does not list this device. It may have been removed from the network in the zigbee2mqtt
                frontend — unpair it here and pair it again.
              </StatusAlert>
            )}

            {/* Controls come before the readout: switching the thing is why
                anyone opens this drawer, and the raw payload below is long
                enough to push them off-screen otherwise. */}
            <div className="sh:flex sh:flex-wrap sh:gap-2">
              <Button variant="secondary" size="sm" isDisabled={busy} onPress={() => void publish({ state: 'ON' })} data-cy="shelly-zigbee-on">
                <PowerIcon className="sh:h-4 sh:w-4" /> On
              </Button>
              <Button variant="secondary" size="sm" isDisabled={busy} onPress={() => void publish({ state: 'OFF' })} data-cy="shelly-zigbee-off">
                <PowerIcon className="sh:h-4 sh:w-4" /> Off
              </Button>
              <Button variant="secondary" size="sm" isDisabled={busy} onPress={() => void publish({ state: 'TOGGLE' })} data-cy="shelly-zigbee-toggle">
                <PowerIcon className="sh:h-4 sh:w-4" /> Toggle
              </Button>
              <Button variant="ghost" size="sm" isDisabled={busy || loading} onPress={() => void refresh()} data-cy="shelly-zigbee-refresh">
                <RefreshCwIcon className="sh:h-4 sh:w-4" /> Refresh
              </Button>
            </div>

            {error && (
              <StatusAlert status="danger" title="Gateway command failed" dataCy="shelly-zigbee-error">
                {error}
              </StatusAlert>
            )}

            <div className="sh:flex sh:flex-col sh:gap-2">
              <span className="sh:text-xs sh:font-medium sh:text-muted">State</span>
              {data?.state ? (
                <>
                  <StateRows state={data.state} />
                  <details className="sh:text-xs">
                    <summary className="sh:cursor-pointer sh:text-muted">Raw payload</summary>
                    <pre className="sh:mt-2 sh:max-h-40 sh:overflow-auto sh:rounded-lg sh:bg-surface-tertiary sh:p-3">
                      {JSON.stringify(data.state, null, 2)}
                    </pre>
                  </details>
                </>
              ) : (
                <p className="sh:text-sm sh:text-muted" data-cy="shelly-zigbee-no-state">
                  zigbee2mqtt has not published a state for this device yet.
                </p>
              )}
            </div>
          </div>
        )}
      </DrawerBody>
      <DrawerFooter>
        <Button variant="secondary" onPress={close}>
          Close
        </Button>
        <Button variant="danger" isPending={busy} onPress={() => void unpair()} data-cy="shelly-zigbee-unpair">
          <UnlinkIcon className="sh:h-4 sh:w-4" /> Unpair
        </Button>
      </DrawerFooter>
    </StandardDrawer>
  );
}
