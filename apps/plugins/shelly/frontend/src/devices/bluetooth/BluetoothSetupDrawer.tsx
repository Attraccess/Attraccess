// Set up an off-network Shelly over Web Bluetooth (ATT-502). The radio is in
// the operator's browser; Wi-Fi and admin passwords go browser -> device only.
import { DrawerBody, DrawerFooter, DrawerHeader, DrawerHeading } from '@heroui/react';
import { BluetoothIcon, XIcon } from 'lucide-react';
import { useCallback } from 'react';
import { Button, StandardDrawer } from '@attraccess/plugins-frontend-ui';
import { useShellyTranslations } from '../../i18n';
import { isWebBluetoothAvailable } from '../../bluetooth/webBluetooth';
import { SetupFooter } from './SetupFooter';
import { SetupPhaseView } from './SetupPhaseView';
import { UnsupportedBrowser } from './UnsupportedBrowser';
import { useSetupSession } from './useSetupSession';

export function BluetoothSetupDrawer({
  isOpen,
  onOpenChange,
  onRegistered,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onRegistered: () => void;
}) {
  const { t } = useShellyTranslations();
  const { phase, connect, run, reset } = useSetupSession(onRegistered);
  const supported = isWebBluetoothAvailable();
  // The link and the steps cannot be interrupted halfway.
  const busy = phase.kind === 'connecting' || phase.kind === 'running';

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && busy) return;
      if (!open) reset();
      onOpenChange(open);
    },
    [busy, onOpenChange, reset],
  );
  const close = useCallback(() => handleOpenChange(false), [handleOpenChange]);

  return (
    <StandardDrawer
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      backdropProps={{ isDismissable: !busy, isKeyboardDismissDisabled: busy }}
    >
      <DrawerHeader>
        <div className="sh:flex sh:w-full sh:items-start sh:justify-between sh:gap-3">
          <div className="sh:flex sh:min-w-0 sh:flex-col sh:gap-1">
            <div className="sh:flex sh:items-center sh:gap-2">
              <BluetoothIcon className="sh:h-5 sh:w-5 sh:shrink-0 sh:text-accent-soft-foreground" />
              <DrawerHeading className="sh:text-lg sh:font-semibold">{t('ble.title')}</DrawerHeading>
            </div>
            <p className="sh:text-sm sh:text-muted">{t('ble.description')}</p>
          </div>
          <Button isIconOnly variant="ghost" aria-label={t('common.close')} isDisabled={busy} onPress={close}>
            <XIcon size={16} />
          </Button>
        </div>
      </DrawerHeader>
      <DrawerBody>
        {supported ? (
          <div className="sh:flex sh:flex-col sh:gap-5">
            <SetupPhaseView phase={phase} onSubmit={(info, values) => void run(info, values)} />
          </div>
        ) : (
          <UnsupportedBrowser />
        )}
      </DrawerBody>
      <DrawerFooter>
        <SetupFooter
          phase={phase}
          supported={supported}
          busy={busy}
          onSelect={() => void connect()}
          onRetry={reset}
          onClose={close}
        />
      </DrawerFooter>
    </StandardDrawer>
  );
}
