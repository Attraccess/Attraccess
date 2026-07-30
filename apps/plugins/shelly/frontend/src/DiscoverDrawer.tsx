// Auto-discovery drawer (ATT-497): runs mDNS + a subnet scan on the server and
// reports what landed in the registry.
//
// The subnet field is optional but, in practice, required for the common
// deployment: inside Docker the API cannot see LAN multicast and its own network
// is the container bridge, so the operator names their LAN CIDR here.
import { Button, Chip, DrawerBody, DrawerHeader, Form, Spinner } from '@heroui/react';
import { SearchIcon, XIcon } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { discoverDevices, type DiscoveryResult } from './api';
import { StandardDrawer, TextFieldRow } from './drawer';
import { StatusAlert } from './StatusAlert';

function ResultSummary({ result }: { result: DiscoveryResult }) {
  const added = result.devices.filter((device) => device.isNew).length;
  const scanned = result.subnets.length > 0 ? result.subnets.join(', ') : 'no subnet (mDNS only)';

  return (
    <div className="sh:flex sh:flex-col sh:gap-3" data-cy="shelly-discover-result">
      <StatusAlert
        status={result.devices.length > 0 ? 'success' : 'warning'}
        title={result.devices.length > 0 ? `Found ${result.devices.length}, added ${added}` : 'No devices found'}
      >
        Probed {result.probed} address{result.probed === 1 ? '' : 'es'} in {scanned}.
      </StatusAlert>

      {result.devices.length === 0 && (
        <p className="sh:text-sm sh:text-muted">
          Nothing answered <code>GET /shelly</code>. If Attraccess runs in a container, enter the subnet your devices
          are on — the container's own network is not your LAN.
        </p>
      )}

      <ul className="sh:flex sh:flex-col sh:gap-2">
        {result.devices.map((device) => (
          <li
            key={device.deviceId}
            className="sh:flex sh:flex-wrap sh:items-center sh:justify-between sh:gap-2 sh:rounded-lg sh:bg-surface sh:px-3 sh:py-2"
            data-cy={`shelly-discovered-${device.deviceId}`}
          >
            <div className="sh:min-w-0">
              <div className="sh:truncate sh:font-medium sh:text-foreground">{device.name}</div>
              <div className="sh:text-xs sh:text-muted">
                {device.ipAddress} · Gen {device.generation} · via {device.source === 'mdns' ? 'mDNS' : 'subnet scan'}
              </div>
            </div>
            <Chip variant="soft" color={device.isNew ? 'success' : 'default'}>
              {device.isNew ? 'Added' : 'Already known'}
            </Chip>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DiscoverDrawer({
  isOpen,
  onOpenChange,
  onDiscovered,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscovered: () => void;
}) {
  const [cidr, setCidr] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiscoveryResult | null>(null);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  // The button is both type="submit" and onPress={submit}, so one click can call
  // this twice; a ref (not the state) because both calls land in the same tick.
  const inFlight = useRef(false);

  const submit = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const discovered = await discoverDevices({ cidr: cidr.trim() || undefined });
      setResult(discovered);
      // Refresh the table behind the drawer even when nothing new turned up:
      // known devices had their probe data refreshed.
      onDiscovered();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight.current = false;
      setRunning(false);
    }
  }, [cidr, onDiscovered]);

  return (
    <StandardDrawer isOpen={isOpen} onOpenChange={onOpenChange} label="Discover devices">
      <DrawerHeader>
        <div className="sh:flex sh:w-full sh:items-start sh:justify-between sh:gap-3">
          <div className="sh:flex sh:flex-col sh:gap-1">
            <h2 className="sh:text-lg sh:font-semibold">Discover devices</h2>
            <p className="sh:text-sm sh:text-muted">
              Listens for Shelly devices announcing over mDNS, then probes every address of a subnet. Everything found
              is added to the registry.
            </p>
          </div>
          <Button isIconOnly variant="ghost" aria-label="Close" onPress={close}>
            <XIcon size={16} />
          </Button>
        </div>
      </DrawerHeader>
      <DrawerBody>
        <Form onSubmit={submit} className="sh:flex sh:flex-col sh:gap-4">
          <TextFieldRow
            label="Subnet to scan (optional)"
            value={cidr}
            onChange={setCidr}
            placeholder="192.168.1.0/24"
            description="Leave empty to scan the server's own networks. Private ranges only, /22 at most. Required when Attraccess runs in a container, since its network is not your LAN."
            dataCy="shelly-discover-cidr"
          />

          {error && (
            <StatusAlert status="danger" title="Discovery failed" dataCy="shelly-discover-error">
              {error}
            </StatusAlert>
          )}

          {running && (
            <div className="sh:flex sh:items-center sh:gap-3 sh:text-sm sh:text-muted">
              <Spinner color="accent" size="sm" />
              Probing addresses — a /24 takes a few seconds.
            </div>
          )}

          {result && !running && <ResultSummary result={result} />}

          <div className="sh:flex sh:justify-end sh:gap-2 sh:pt-2">
            <Button variant="secondary" onPress={close}>
              {result ? 'Done' : 'Cancel'}
            </Button>
            <Button
              variant="primary"
              type="submit"
              isPending={running}
              onPress={submit}
              data-cy="shelly-discover-submit"
            >
              <SearchIcon className="sh:h-4 sh:w-4" /> Start discovery
            </Button>
          </div>
          <input type="submit" hidden />
        </Form>
      </DrawerBody>
    </StandardDrawer>
  );
}
