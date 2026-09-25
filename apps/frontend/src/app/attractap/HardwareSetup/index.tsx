import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Chip, DrawerBody, DrawerHeader, useOverlayState } from '@heroui/react';
import { UsbIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/button';
import { StandardDrawer } from '../../../components/standardDrawer';
import { ConnectionStateEvent, ESPTools } from '../../../utils/esp-tools';
import { SetupTabs } from './SetupTabs';

import de from './de.json';
import en from './en.json';

function ConnectScreen() {
  const { t } = useTranslations({ de, en });
  const espTools = useRef(ESPTools.getInstance());
  const [isConnecting, setIsConnecting] = useState(false);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    try {
      await espTools.current.connectToDevice();
    } catch (err) {
      console.error('Failed to connect to device', err);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 py-10 text-center">
      <div className="rounded-full bg-primary-100 p-4 dark:bg-primary-900/40">
        <UsbIcon className="w-8 h-8 text-primary-600 dark:text-primary-300" />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">{t('connect.title')}</h3>
        <p className="max-w-md text-sm text-muted">{t('connect.description')}</p>
      </div>
      <Button variant="primary" onPress={connect} isPending={isConnecting} className="w-full max-w-xs">
        {t('connect.button.label')}
      </Button>
    </div>
  );
}

interface SetupContentProps {
  openDeviceSettings: (deviceId: string) => void;
  onClose: () => void;
}

function SetupContent({ openDeviceSettings, onClose }: SetupContentProps) {
  const espTools = useRef(ESPTools.getInstance());
  const [connectionState, setConnectionState] = useState<{ connected: boolean; reconnecting: boolean }>({
    connected: espTools.current.isConnected,
    reconnecting: false,
  });

  useEffect(() => {
    const tools = espTools.current;
    const onConnectionState = (event: ConnectionStateEvent) =>
      setConnectionState({ connected: event.connected, reconnecting: event.reconnecting });
    tools.on('connectionState', onConnectionState);
    return () => tools.off('connectionState', onConnectionState);
  }, []);

  // While auto-reconnect is running (device rebooted after flashing or was
  // power-cycled), keep the setup tabs mounted so the wizard state (selected
  // tab, session) survives the brief USB re-enumeration (ATT-556).
  if (!connectionState.connected && !connectionState.reconnecting) {
    return <ConnectScreen />;
  }

  return <SetupTabs openDeviceSettings={openDeviceSettings} onClose={onClose} />;
}

interface Props {
  children: (onOpen: () => void) => React.ReactNode;
  openDeviceSettings: (deviceId: string) => void;
}

export function AttractapHardwareSetup(props: Props) {
  const { children, openDeviceSettings } = props;

  const { t } = useTranslations({ de, en });
  const { isOpen, open, setOpen, close } = useOverlayState();

  const espTools = useRef(ESPTools.getInstance());
  const [connectionState, setConnectionState] = useState<{ connected: boolean; reconnecting: boolean }>({
    connected: espTools.current.isConnected,
    reconnecting: false,
  });

  useEffect(() => {
    const tools = espTools.current;
    const onConnectionState = (event: ConnectionStateEvent) =>
      setConnectionState({ connected: event.connected, reconnecting: event.reconnecting });
    tools.on('connectionState', onConnectionState);
    return () => tools.off('connectionState', onConnectionState);
  }, []);

  const connectionChipLabel = connectionState.connected
    ? t('connection.connected')
    : connectionState.reconnecting
      ? t('connection.reconnecting')
      : t('connection.disconnected');

  return (
    <>
      {children(open)}

      <StandardDrawer isOpen={isOpen} onOpenChange={setOpen}>
        <DrawerHeader>
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex flex-col">
              <h2 className="text-lg font-semibold">{t('title')}</h2>
              <p className="text-sm text-muted">{t('subtitle')}</p>
            </div>
            <Chip color={connectionState.connected ? 'success' : connectionState.reconnecting ? 'warning' : 'default'}>
              {connectionChipLabel}
            </Chip>
          </div>
        </DrawerHeader>

        <DrawerBody className="pb-6">
          <SetupContent
            openDeviceSettings={(deviceId) => {
              close();
              openDeviceSettings(deviceId);
            }}
            onClose={close}
          />
        </DrawerBody>
      </StandardDrawer>
    </>
  );
}
