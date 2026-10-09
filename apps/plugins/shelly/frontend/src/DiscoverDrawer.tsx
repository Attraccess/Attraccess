// Auto-discovery drawer (ATT-497): runs mDNS + a subnet scan on the server and
// reports what landed in the registry.
//
// The subnet field is optional but, in practice, required for the common
// deployment: inside Docker the API cannot see LAN multicast and its own network
// is the container bridge, so the operator names their LAN CIDR here.
import { Button, Chip, DrawerBody, DrawerHeader, DrawerHeading, Form, Spinner } from '@heroui/react';
import { SearchIcon, XIcon } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { discoverDevices, type DiscoveryResult } from './api';
import { StandardDrawer, TextFieldRow } from './shared/drawer';
import { StatusAlert } from './shared/StatusAlert';
import { useShellyTranslations } from './i18n';

function ResultSummary({ result }: { result: DiscoveryResult }) {
  const { t } = useShellyTranslations();
  const added = result.devices.filter((device) => device.isNew).length;
  const scanned = result.subnets.length > 0 ? result.subnets.join(', ') : t('discovery.mdnsOnly');

  return (
    <div className="sh:flex sh:flex-col sh:gap-3" data-cy="shelly-discover-result">
      <StatusAlert
        status={result.devices.length > 0 ? 'success' : 'warning'}
        title={
          result.devices.length > 0
            ? t('discovery.found', { count: result.devices.length, added })
            : t('discovery.empty')
        }
      >
        {t('discovery.probed', { count: result.probed, subnets: scanned })}
      </StatusAlert>

      {result.devices.length === 0 && <p className="sh:text-sm sh:text-muted">{t('discovery.hint')}</p>}

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
                {device.ipAddress} · {t('devices.generation', { generation: device.generation })} ·{' '}
                {t('discovery.via', { source: device.source === 'mdns' ? 'mDNS' : t('discovery.scan') })}
              </div>
            </div>
            <Chip variant="soft" color={device.isNew ? 'success' : 'default'}>
              {t(device.isNew ? 'discovery.added' : 'discovery.known')}
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
  const { t } = useShellyTranslations();
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
    <StandardDrawer isOpen={isOpen} onOpenChange={onOpenChange}>
      <DrawerHeader>
        <div className="sh:flex sh:w-full sh:items-start sh:justify-between sh:gap-3">
          <div className="sh:flex sh:flex-col sh:gap-1">
            <DrawerHeading className="sh:text-lg sh:font-semibold">{t('discovery.title')}</DrawerHeading>
            <p className="sh:text-sm sh:text-muted">{t('discovery.description')}</p>
          </div>
          <Button isIconOnly variant="ghost" aria-label={t('common.close')} onPress={close}>
            <XIcon size={16} />
          </Button>
        </div>
      </DrawerHeader>
      <DrawerBody>
        <Form onSubmit={submit} className="sh:flex sh:flex-col sh:gap-4">
          <TextFieldRow
            label={t('discovery.subnet')}
            value={cidr}
            onChange={setCidr}
            placeholder="192.168.1.0/24"
            description={t('discovery.subnetDescription')}
            dataCy="shelly-discover-cidr"
          />

          {error && (
            <StatusAlert status="danger" title={t('discovery.error')} dataCy="shelly-discover-error">
              {error}
            </StatusAlert>
          )}

          {running && (
            <div className="sh:flex sh:items-center sh:gap-3 sh:text-sm sh:text-muted">
              <Spinner color="accent" size="sm" />
              {t('discovery.running')}
            </div>
          )}

          {result && !running && <ResultSummary result={result} />}

          <div className="sh:flex sh:justify-end sh:gap-2 sh:pt-2">
            <Button variant="secondary" onPress={close}>
              {t(result ? 'common.done' : 'common.cancel')}
            </Button>
            <Button
              variant="primary"
              type="submit"
              isPending={running}
              onPress={submit}
              data-cy="shelly-discover-submit"
            >
              <SearchIcon className="sh:h-4 sh:w-4" /> {t('discovery.start')}
            </Button>
          </div>
          <input type="submit" hidden />
        </Form>
      </DrawerBody>
    </StandardDrawer>
  );
}
