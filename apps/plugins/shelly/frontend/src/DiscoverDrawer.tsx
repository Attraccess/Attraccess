// Auto-discovery drawer (ATT-497): runs mDNS + a subnet scan on the server and
// reports what landed in the registry.
//
// The subnet field is optional but, in practice, required for the common
// deployment: inside Docker the API cannot see LAN multicast and its own network
// is the container bridge, so the operator names their LAN CIDR here.
import { Button, Chip, DrawerBody, DrawerHeader, Form, Spinner } from '@heroui/react';
import { SearchIcon, XIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { discoverDevices, type DiscoveryResult } from './api';
import { StandardDrawer, TextFieldRow } from './drawer';
import { StatusAlert } from './StatusAlert';

function ResultSummary({ result }: { result: DiscoveryResult }) {
  const added = result.devices.filter((device) => device.isNew).length;
  const scanned = result.subnets.length > 0 ? result.subnets.join(', ') : 'no subnet (mDNS only)';

  return (
    <div className="flex flex-col gap-3" data-cy="shelly-discover-result">
      <StatusAlert
        status={result.devices.length > 0 ? 'success' : 'warning'}
        title={result.devices.length > 0 ? `Found ${result.devices.length}, added ${added}` : 'No devices found'}
      >
        Probed {result.probed} address{result.probed === 1 ? '' : 'es'} in {scanned}.
      </StatusAlert>

      {result.devices.length === 0 && (
        <p className="text-sm text-muted">
          Nothing answered <code>GET /shelly</code>. If Attraccess runs in a container, enter the subnet your devices
          are on — the container's own network is not your LAN.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {result.devices.map((device) => (
          <li
            key={device.deviceId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2"
            data-cy={`shelly-discovered-${device.deviceId}`}
          >
            <div className="min-w-0">
              <div className="truncate font-medium text-foreground">{device.name}</div>
              <div className="text-xs text-muted">
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

  const submit = useCallback(async () => {
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
      setRunning(false);
    }
  }, [cidr, onDiscovered]);

  return (
    <StandardDrawer isOpen={isOpen} onOpenChange={onOpenChange}>
      <DrawerHeader>
        <div className="flex w-full items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">Discover devices</h2>
            <p className="text-sm text-muted">
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
        <Form onSubmit={submit} className="flex flex-col gap-4">
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
            <div className="flex items-center gap-3 text-sm text-muted">
              <Spinner color="accent" size="sm" />
              Probing addresses — a /24 takes a few seconds.
            </div>
          )}

          {result && !running && <ResultSummary result={result} />}

          <div className="flex justify-end gap-2 pt-2">
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
              <SearchIcon className="h-4 w-4" /> Start discovery
            </Button>
          </div>
          <input type="submit" hidden />
        </Form>
      </DrawerBody>
    </StandardDrawer>
  );
}
