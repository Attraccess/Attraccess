import { Button, DrawerBody, DrawerFooter, DrawerHeader, Skeleton } from '@heroui/react';
import { InfoIcon, RefreshCwIcon, XIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { getDeviceInfo, type ShellyDevice, type ShellyDeviceInfo } from './api';
import { StandardDrawer } from './drawer';
import { StatusAlert } from './StatusAlert';
import { useShellyTranslations } from './i18n';
import { AuthProtectedForm } from './DeviceInfoDrawer.auth-protected-form.helpers';
import { DeviceInfoCards } from './DeviceInfoDrawer.auth-protected-form.helpers';

export function DeviceInfoDrawer({
  device,
  onOpenChange,
}: {
  device: ShellyDevice | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, language } = useShellyTranslations();
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
              <h2 className="sh:text-lg sh:font-semibold">{device?.name ?? t('info.title')}</h2>
            </div>
            {device && <p className="sh:text-sm sh:text-muted">{device.ipAddress}</p>}
          </div>
          <Button isIconOnly variant="ghost" aria-label={t('common.close')} onPress={close}>
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
            <StatusAlert status="danger" title={t('info.loadError')}>
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
            {info ? t('info.updated', { time: new Date(info.fetchedAt).toLocaleTimeString(language) }) : ''}
          </span>
          <Button variant="secondary" onPress={() => void load()} isPending={loading} data-cy="shelly-info-refresh">
            <RefreshCwIcon className="sh:h-4 sh:w-4" /> {t('common.refresh')}
          </Button>
        </div>
      </DrawerFooter>
    </StandardDrawer>
  );
}
