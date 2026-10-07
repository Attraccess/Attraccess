// Firmware/OTA UI (ATT-501): shows the installed version, whatever the device
// offers on the stable/beta channel, and runs the update while polling for the
// device to come back.
import { Button, DrawerBody, DrawerFooter, DrawerHeader, DrawerHeading, Spinner, Tooltip } from '@heroui/react';
import { ArrowUpCircleIcon, CpuIcon, DownloadIcon, RefreshCwIcon, XIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePluginLiveUpdates } from '@attraccess/plugins-frontend-sdk';
import {
  getFirmware,
  startFirmwareUpdate,
  type FirmwareOverviewEntry,
  type FirmwareStage,
  type FirmwareStatus,
  type ShellyDevice,
} from './api';
import { PasswordFieldRow, StandardDrawer } from './drawer';
import { StatusAlert } from './StatusAlert';
import { useShellyTranslations } from './i18n';
import type { TranslationMessage } from '@attraccess/plugins-frontend-ui';

// A Shelly OTA takes ~30-90s including the reboot; past this we stop claiming
// progress and let the operator re-check manually.
const UPDATE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Gen1 reports versions as `20230913-114150/v1.14.0` — only the tail is useful
 * at a glance, the full string stays in the tooltip.
 */
function shortVersion(version: string): string {
  const tail = version.split('/').pop();
  return tail && tail.length > 0 ? tail : version;
}

/** Table cell summarising a device's firmware state from the bulk overview. */
export function FirmwareCell({ entry }: { entry: FirmwareOverviewEntry | undefined }) {
  const { t } = useShellyTranslations();
  if (!entry) {
    return <span className="sh:text-sm sh:text-default-400">{t('firmware.checking')}</span>;
  }
  if (entry.error || !entry.status) {
    return (
      <span
        className="sh:block sh:max-w-40 sh:truncate sh:text-sm sh:text-default-400"
        title={entry.error ?? undefined}
      >
        {t('firmware.unavailable')}
      </span>
    );
  }
  return (
    <div className="sh:flex sh:flex-col sh:gap-1">
      <span
        className="sh:block sh:max-w-40 sh:truncate sh:text-sm sh:text-default-700"
        title={entry.status.currentVersion ?? undefined}
      >
        {entry.status.currentVersion ? shortVersion(entry.status.currentVersion) : t('devices.unknown')}
      </span>
      {entry.status.hasUpdate && entry.status.available.stable && (
        <span className="sh:max-w-40 sh:truncate sh:text-xs sh:text-warning-600" title={entry.status.available.stable}>
          {t('firmware.available', { version: shortVersion(entry.status.available.stable) })}
        </span>
      )}
    </div>
  );
}

/**
 * "Update available" marker next to the device name, so the signal survives the
 * breakpoints where the Firmware column is hidden. Icon-only on purpose: a text
 * chip here widens the Device column enough to push the row actions out of the
 * table's visible width on tablets.
 */
export function UpdateAvailableIndicator({ entry }: { entry: FirmwareOverviewEntry | undefined }) {
  const { t } = useShellyTranslations();
  const version = entry?.status?.hasUpdate ? entry.status.available.stable : null;
  if (!version) return null;
  const label = t('firmware.updateAvailable', { version: shortVersion(version) });
  return (
    <Tooltip>
      <Tooltip.Trigger>
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          aria-label={label}
          className="sh:h-6 sh:w-6 sh:min-w-6 sh:text-warning"
          data-cy="shelly-update-available"
        >
          <ArrowUpCircleIcon className="sh:h-4 sh:w-4" />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}

function VersionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="sh:flex sh:items-baseline sh:justify-between sh:gap-3 sh:border-b sh:border-default-200 sh:py-2 sh:last:border-b-0">
      <span className="sh:text-xs sh:font-medium sh:uppercase sh:tracking-wide sh:text-default-500">{label}</span>
      <span className="sh:min-w-0 sh:truncate sh:text-sm sh:text-default-800" title={value}>
        {value}
      </span>
    </div>
  );
}

export function FirmwareDetails({ status }: { status: FirmwareStatus | null }) {
  const { t, language } = useShellyTranslations();
  if (!status) {
    return (
      <div className="sh:rounded-xl sh:border sh:border-dashed sh:border-default-300 sh:p-4 sh:text-sm sh:text-default-500">
        {t('firmware.empty')}
      </div>
    );
  }
  return (
    <section
      className="sh:rounded-xl sh:border sh:border-default-200 sh:bg-surface sh:p-4"
      data-cy="shelly-firmware-details"
    >
      <VersionRow label={t('firmware.installed')} value={status.currentVersion ?? t('devices.unknown')} />
      <VersionRow label={t('firmware.stable')} value={status.available.stable ?? t('firmware.upToDate')} />
      <VersionRow label={t('firmware.beta')} value={status.available.beta ?? t('firmware.nothingNewer')} />
      <VersionRow label={t('firmware.checked')} value={new Date(status.fetchedAt).toLocaleString(language)} />
    </section>
  );
}

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

  const stages: FirmwareStage[] = ['stable', 'beta'];

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
            <PasswordFieldRow
              label={t('password.current')}
              value={currentPassword}
              onChange={setCurrentPassword}
              description={t('password.currentDescription')}
              autoComplete="current-password"
              dataCy="shelly-firmware-current-password"
            />
          )}

          {error && (
            <StatusAlert status="danger" title={t('firmware.error')} dataCy="shelly-firmware-error">
              {tMessage(error)}
            </StatusAlert>
          )}

          {installing && (
            <StatusAlert status="accent" title={t('firmware.running')} dataCy="shelly-firmware-progress">
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
            <StatusAlert status="success" title={t('firmware.finished')} dataCy="shelly-firmware-success">
              {t('firmware.success', { version: installedVersion })}
            </StatusAlert>
          )}

          {loading && !status ? (
            <div className="sh:flex sh:items-center sh:justify-center sh:p-6">
              <Spinner color="accent" />
            </div>
          ) : (
            <FirmwareDetails status={status} />
          )}
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
        {stages.map((stage) => {
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
