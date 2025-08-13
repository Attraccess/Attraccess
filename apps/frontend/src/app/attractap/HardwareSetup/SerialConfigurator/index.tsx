import { Alert, Button, CircularProgress, Tab, Tabs } from '@heroui/react';
import { ESPTools, ESPToolsResult } from '../../../../utils/esp-tools';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { AttractapSerialConfiguratorNetwork } from './Network';
import { AttractapSerialConfiguratorAttraccess } from './Attraccess';
import { AttractapSerialConfiguratorKeypad } from './Keypad';

import de from './de.json';
import en from './en.json';

interface Props {
  openDeviceSettings: (deviceId: string) => void;
}

export function AttractapSerialConfigurator(props: Props) {
  const { openDeviceSettings } = props;

  const { t } = useTranslations('attractap.hardwareSetup.serialConfigurator', {
    de,
    en,
  });

  const [error, setError] = useState<ESPToolsResult['error'] | null>(null);
  const espTools = useRef<ESPTools | null>(ESPTools.getInstance());
  const [state, setState] = useState<'idle' | 'connecting' | 'connected' | 'error'>(
    espTools.current?.isConnected ? 'connected' : 'idle'
  );

  const [selectedTab, setSelectedTab] = useState<'main' | 'keypad'>('main');
  const [isCheckingKeypad, setIsCheckingKeypad] = useState(false);
  const [isKeypadAvailable, setIsKeypadAvailable] = useState<boolean | null>(null);

  const connect = useCallback(async () => {
    try {
      setState('connecting');

      const espTools = ESPTools.getInstance();
      const connectionResult = await espTools.connectToDevice();

      if (!connectionResult.success) {
        setError(connectionResult.error);
        setState('error');
        return;
      }
      setState('connected');
    } catch (error) {
      setError(error as ESPToolsResult['error']);
      setState('error');
    }
  }, []);

  const pollKeypadAvailability = useCallback(() => {
    let cancelled = false;

    const check = async () => {
      if (cancelled) return;
      try {
        setIsCheckingKeypad(true);
        const espTools = ESPTools.getInstance();
        const response = await espTools.sendCommand({ topic: 'keypad.status', type: 'GET' }, true, 2000);
        if (!response) {
          setTimeout(check, 1500);
          return;
        }
        try {
          const data = JSON.parse(response) as { detail?: { type?: string } };
          const type = (data?.detail?.type ?? 'NONE') as string;
          const available = type === 'MPR121';
          setIsKeypadAvailable(available);
          setIsCheckingKeypad(false);
        } catch {
          setTimeout(check, 1500);
        }
      } catch {
        setTimeout(check, 1500);
      }
    };

    check();

    return () => {
      cancelled = true;
    };
  }, []);

  // Start polling for keypad availability once connected
  useEffect(() => {
    if (state !== 'connected') return;
    const stop = pollKeypadAvailability();
    return () => {
      stop?.();
    };
  }, [state, pollKeypadAvailability]);

  if (state === 'idle') {
    return <Button onPress={connect}>{t('actions.connect')}</Button>;
  }

  if (state === 'connecting') {
    return (
      <div className="flex flex-col items-center justify-center gap-4">
        <CircularProgress isIndeterminate label={t('connecting.progress.label')} />
      </div>
    );
  }

  if (state === 'error') {
    return (
      <Alert color="danger" title={error?.type}>
        <div>{error?.details as string}</div>
        <Button onPress={connect}>{t('actions.retryConnect')}</Button>
      </Alert>
    );
  }

  return (
    <div className="w-full">
      <Tabs selectedKey={selectedTab} onSelectionChange={(key) => setSelectedTab(key as 'main' | 'keypad')}>
        <Tab key="main" title={t('tabs.main')}>
          <div className="flex gap-4 flex-wrap w-full items-stretch">
            <AttractapSerialConfiguratorNetwork className="flex-1" />
            <AttractapSerialConfiguratorAttraccess openDeviceSettings={openDeviceSettings} className="flex-1" />
          </div>
        </Tab>
        {isKeypadAvailable && (
          <Tab key="keypad" title={t('tabs.keypad')}>
            <AttractapSerialConfiguratorKeypad className="flex-1" />
          </Tab>
        )}
      </Tabs>
      {isCheckingKeypad && <div className="mt-2 text-default-400 text-sm">{t('tabs.checkingKeypad')}</div>}
    </div>
  );
}
