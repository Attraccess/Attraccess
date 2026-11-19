import { StandardDrawer, useTranslations } from '@attraccess/plugins-frontend-ui';
import { Chip, DrawerBody, DrawerHeader, DrawerHeading, useOverlayState } from '@heroui/react';
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
  const { kind, closedAfterPairing } = useConfiguratorConnection();

  if (!kind) {
    return <ConnectScreen closedAfterPairing={closedAfterPairing} />;
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

  const { kind } = useConfiguratorConnection();

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
