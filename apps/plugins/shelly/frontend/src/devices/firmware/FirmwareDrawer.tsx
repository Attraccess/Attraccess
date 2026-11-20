import {
  Button,
  PasswordInput,
  StandardDrawer,
  StatusAlert,
  TableDataLoadingIndicator,
  type TranslationMessage,
} from '@attraccess/plugins-frontend-ui';
import { usePluginLiveUpdates } from '@attraccess/plugins-frontend-sdk';
import { DrawerBody, DrawerFooter, DrawerHeader, DrawerHeading, Spinner } from '@heroui/react';
import { CpuIcon, DownloadIcon, RefreshCwIcon, XIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getFirmware,
  startFirmwareUpdate,
  type FirmwareStage,
  type FirmwareStatus,
  type ShellyDevice,
} from '../../api';
import { useShellyTranslations } from '../../i18n';
import { FirmwareDetails } from './FirmwareDetails';
import { shortVersion } from './shortVersion';

// A Shelly OTA takes ~30-90s including the reboot; past this we stop claiming
// progress and let the operator re-check manually.
const UPDATE_TIMEOUT_MS = 5 * 60 * 1000;
const STAGES: FirmwareStage[] = ['stable', 'beta'];

export function FirmwareDrawer({
  device,
  onOpenChange,
  onUpdated,
}: {
  device: ShellyDevice | null;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}) {
  const { t, tMessage } = useShellyTranslations();
  const [status, setStatus] = useState<FirmwareStatus | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | TranslationMessage | null>(null);
  const [installing, setInstalling] = useState<FirmwareStage | null>(null);
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const targetVersion = useRef<string | null>(null);
  const deadline = useRef(0);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const fetchStatus = useCallback(async () => {
    if (!device) return null;
    return getFirmware(device.id, { currentPassword: currentPassword || undefined });
  }, [device, currentPassword]);

  const load = useCallback(async () => {
    if (!device) return;
    setLoading(true);
    setError(null);
    try {
      setStatus(await fetchStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [device, fetchStatus]);

  useEffect(() => {
    if (!device) return;
    setStatus(null);
    setInstalling(null);
    setInstalledVersion(null);
    setError(null);
    void load();
    // Deliberately keyed on `device` alone: `load` also changes with the typed
    // password, which must not refetch on every keystroke.
  }, [device]);

  const install = useCallback(
    async (stage: FirmwareStage) => {
      if (!device) return;
      setError(null);
      setInstalling(stage);
      targetVersion.current = status?.available[stage] ?? null;
      deadline.current = Date.now() + UPDATE_TIMEOUT_MS;
      try {
        await startFirmwareUpdate(device.id, { stage, currentPassword: currentPassword || undefined });
      } catch (err) {
        setInstalling(null);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [currentPassword, device, status],
  );

  usePluginLiveUpdates<{ eventType: 'snapshot'; value: FirmwareStatus } | { eventType: 'unavailable' }>({
    plugin: 'shelly',
    topic: 'firmware',
    identifier: String(device?.id),
    enabled: !!installing && !!device,
    onUpdate: (event) => {
      if (event.eventType !== 'snapshot') return;
      const next = event.value;
      setStatus(next);
      const done = targetVersion.current ? next.currentVersion === targetVersion.current : !next.hasUpdate;
      if (done && next.state !== 'updating' && next.state !== 'pending') {
        setInstalling(null);
        setInstalledVersion(next.currentVersion);
        onUpdated();
      }
    },
  });

  // The deadline must still fire if the stream/device is offline or silently rolls back.
  useEffect(() => {
    if (!installing || !device) return;
    const timeout = setTimeout(
      () => {
        setInstalling(null);
        setError({ key: 'firmware.timeout' });
      },
      Math.max(0, deadline.current - Date.now()),
    );
    return () => clearTimeout(timeout);
  }, [installing, device]);

  return (
    <StandardDrawer isOpen={!!device} onOpenChange={onOpenChange}>
      <DrawerHeader>
        <div className="sh:flex sh:w-full sh:items-start sh:justify-between sh:gap-3">
          <div className="sh:flex sh:min-w-0 sh:flex-col sh:gap-1">
            <div className="sh:flex sh:items-center sh:gap-2">
              <CpuIcon className="sh:h-5 sh:w-5 sh:shrink-0 sh:text-accent-soft-foreground" />
              <DrawerHeading className="sh:text-lg sh:font-semibold">{t('devices.firmware')}</DrawerHeading>
            </div>
            {device && (
              <p className="sh:text-sm sh:text-muted">
                {t('firmware.description', { name: device.name, address: device.ipAddress })}
              </p>
            )}
          </div>
          <Button isIconOnly variant="ghost" aria-label={t('common.close')} onPress={close}>
            <XIcon size={16} />
          </Button>
        </div>
      </DrawerHeader>
      <DrawerBody>
        <div className="sh:flex sh:flex-col sh:gap-4">
          {device?.authState === 'required' && (
            <PasswordInput
              label={t('password.current')}
              value={currentPassword}
              onChange={setCurrentPassword}
              description={t('password.currentDescription')}
              autoComplete="current-password"
              data-cy="shelly-firmware-current-password"
            />
          )}

          {error && (
            <StatusAlert status="danger" title={t('firmware.error')} data-cy="shelly-firmware-error">
              {tMessage(error)}
            </StatusAlert>
          )}

          {installing && (
            <StatusAlert status="accent" title={t('firmware.running')} data-cy="shelly-firmware-progress">
              <span className="sh:flex sh:items-center sh:gap-2">
                <Spinner size="sm" color="accent" />
                {t('firmware.installing', {
                  stage: t(`firmware.${installing}Stage`),
                  version: targetVersion.current ? ` (${targetVersion.current})` : '',
                })}
              </span>
            </StatusAlert>
          )}

          {installedVersion && !installing && (
            <StatusAlert status="success" title={t('firmware.finished')} data-cy="shelly-firmware-success">
              {t('firmware.success', { version: installedVersion })}
            </StatusAlert>
          )}

          {loading && !status ? <TableDataLoadingIndicator /> : <FirmwareDetails status={status} />}
        </div>
      </DrawerBody>
      {/* Wraps because the install labels carry a version string — three buttons
          on one row overflow a phone-width drawer. */}
      <DrawerFooter className="sh:flex-wrap">
        <Button
          variant="secondary"
          onPress={load}
          isPending={loading}
          isDisabled={!!installing}
          data-cy="shelly-firmware-refresh"
        >
          <RefreshCwIcon className="sh:h-4 sh:w-4" /> {t('firmware.recheck')}
        </Button>
        {STAGES.map((stage) => {
          const version = status?.available[stage];
          if (!version) return null;
          return (
            <Button
              key={stage}
              variant={stage === 'stable' ? 'primary' : 'secondary'}
              onPress={() => install(stage)}
              isPending={installing === stage}
              isDisabled={!!installing}
              data-cy={`shelly-firmware-install-${stage}`}
              aria-label={t('firmware.installLabel', { stage: t(`firmware.${stage}Stage`), version })}
            >
              <DownloadIcon className="sh:h-4 sh:w-4" />{' '}
              {t('firmware.install', { stage: t(`firmware.${stage}Stage`), version: shortVersion(version) })}
            </Button>
          );
        })}
      </DrawerFooter>
    </StandardDrawer>
  );
}
