import { Alert, Button, CircularProgress } from '@heroui/react';
import { ESPTools, ESPToolsResult } from '../../../../utils/esp-tools';
import { useCallback, useRef, useState } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { AttractapSerialConfiguratorWifi } from './Wifi';
import { AttractapSerialConfiguratorAttraccess } from './Attraccess';

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
    <div className="flex gap-4 flex-wrap w-full items-stretch">
      <AttractapSerialConfiguratorWifi className="flex-1" />
      <AttractapSerialConfiguratorAttraccess openDeviceSettings={openDeviceSettings} className="flex-1" />
    </div>
  );
}
