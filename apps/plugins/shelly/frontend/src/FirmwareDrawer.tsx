// Firmware/OTA UI (ATT-501): shows the installed version, whatever the device
// offers on the stable/beta channel, and runs the update while polling for the
// device to come back.
import { Button, DrawerBody, DrawerFooter, DrawerHeader, Spinner } from '@heroui/react';
import { CpuIcon, DownloadIcon, RefreshCwIcon, XIcon } from 'lucide-react';
import { type ShellyDevice } from './api';
import { PasswordFieldRow, StandardDrawer } from './drawer';
import { StatusAlert } from './StatusAlert';
import { shortVersion } from './FirmwareDrawer.helpers';
import { FirmwareDetails } from './FirmwareDrawer.helpers';
import { useFirmwareDrawerState } from './useFirmwareDrawerState';

// A Shelly OTA takes ~30-90s including the reboot; past this we stop claiming
// progress and let the operator re-check manually.

export function FirmwareDrawer({
  device,
  onOpenChange,
  onUpdated,
}: {
  device: ShellyDevice | null;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}) {
  const {
    t,
    tMessage,
    status,
    currentPassword,
    setCurrentPassword,
    loading,
    error,
    installing,
    installedVersion,
    targetVersion,
    close,
    load,
    install,
    stages,
  } = useFirmwareDrawerState({ device, onOpenChange, onUpdated });

  return (
    <StandardDrawer isOpen={!!device} onOpenChange={onOpenChange}>
      <DrawerHeader>
        <div className="sh:flex sh:w-full sh:items-start sh:justify-between sh:gap-3">
          <div className="sh:flex sh:min-w-0 sh:flex-col sh:gap-1">
            <div className="sh:flex sh:items-center sh:gap-2">
              <CpuIcon className="sh:h-5 sh:w-5 sh:shrink-0 sh:text-accent-soft-foreground" />
              <h2 className="sh:text-lg sh:font-semibold">{t('devices.firmware')}</h2>
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

export { FirmwareCell } from './FirmwareDrawer.helpers';
export { UpdateAvailableIndicator } from './FirmwareDrawer.helpers';
export { FirmwareDetails } from './FirmwareDrawer.helpers';
