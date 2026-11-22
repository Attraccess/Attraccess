import { StandardDrawer, useTranslations } from '@attraccess/plugins-frontend-ui';
import { Chip, DrawerBody, DrawerHeader, DrawerHeading, useOverlayState } from '@heroui/react';
import { useEffect, useRef } from 'react';
import { useToastMessage } from '../../../components/toastProvider';
import { ConnectScreen } from './ConnectScreen';
import { SetupTabs } from './SetupTabs';
import { useConfiguratorConnection } from './useConfiguratorConnection';
import type { OpenDeviceSettings } from './SerialConfigurator/Api';

import de from './de.json';
import en from './en.json';

interface SetupContentProps {
  openDeviceSettings: OpenDeviceSettings;
  onClose: () => void;
}

function SetupContent({ openDeviceSettings, onClose }: SetupContentProps) {
  const { kind, closedAfterPairing, bluetoothLost } = useConfiguratorConnection();

  if (!kind) {
    return <ConnectScreen closedAfterPairing={closedAfterPairing} bluetoothLost={bluetoothLost} />;
  }

  // Keyed so switching between USB and Bluetooth starts a fresh session (PIN, tabs).
  return <SetupTabs key={kind} transport={kind} openDeviceSettings={openDeviceSettings} onClose={onClose} />;
}

interface Props {
  children: (onOpen: () => void) => React.ReactNode;
  openDeviceSettings: OpenDeviceSettings;
}

export function AttractapHardwareSetup(props: Props) {
  const { children, openDeviceSettings } = props;

  const { t } = useTranslations({ de, en });
  const { isOpen, open, setOpen, close } = useOverlayState();

  const { kind, closedAfterPairing } = useConfiguratorConnection();
  const toast = useToastMessage();

  // Approving a reader or bridge closes this drawer for the reader editor, so the "set up" notice on the
  // connect screen is never seen. Confirm it with a toast instead while the drawer is closed.
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  useEffect(() => {
    if (!closedAfterPairing || isOpenRef.current) return;
    toast.success({
      title: t('connect.bluetooth.closedAfterPairing.title'),
      description: t('connect.bluetooth.closedAfterPairing.description'),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- announce only the transition, not every new `t`.
  }, [closedAfterPairing]);

  return (
    <>
      {children(open)}

      <StandardDrawer isOpen={isOpen} onOpenChange={setOpen}>
        <DrawerHeader>
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex flex-col">
              <DrawerHeading className="text-lg font-semibold">{t('title')}</DrawerHeading>
              <p className="text-sm text-muted">{t('subtitle')}</p>
            </div>
            <Chip color={kind ? 'success' : 'default'} data-cy="attractap-setup-connection-chip">
              {kind ? t(`connection.connected.${kind}`) : t('connection.disconnected')}
            </Chip>
          </div>
        </DrawerHeader>

        <DrawerBody className="pb-6">
          <SetupContent
            openDeviceSettings={(deviceId, justPaired) => {
              close();
              openDeviceSettings(deviceId, justPaired);
            }}
            onClose={close}
          />
        </DrawerBody>
      </StandardDrawer>
    </>
  );
}
