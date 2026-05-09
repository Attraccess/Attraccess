import { Alert, Button, ProgressCircle, ProgressCircleFillCircle, ProgressCircleTrack, ProgressCircleTrackCircle } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ESPTools, ESPToolsResult } from '../../../../utils/esp-tools';
import { AttractapSerialConfiguratorNetwork } from './Network';
import { AttractapSerialConfiguratorApi } from './Api';
import { AttractapSerialConfiguratorPin } from './Pin';
import { AttractapSerialCommGate, AttractapSerialCommProvider, useAttractapSerialComm } from './Auth';

import de from './de.json';
import en from './en.json';

interface Props {
  openDeviceSettings: (deviceId: string) => void;
}

function SerialConfiguratorContent({ openDeviceSettings }: Props) {
  const { fetchConfiguration, isAuthenticated } = useAttractapSerialComm();
  const { t } = useTranslations({ de, en });

  const [isLoadingInitialData, setIsLoadingInitialData] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    let cancelled = false;
    const run = async () => {
      setIsLoadingInitialData(true);
      try {
        await fetchConfiguration();
      } catch (err) {
        console.error('Initial serial configurator fetch failed', err);
      } finally {
        if (!cancelled) {
          setIsLoadingInitialData(false);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [fetchConfiguration, isAuthenticated]);

  return (
    <div className="w-full flex flex-row flex-wrap flex-stretch gap-4">
      {isLoadingInitialData && (
        <Alert color="primary" title={t('connecting.progress.label')}>
          {t('connecting.progress.label')}
        </Alert>
      )}

      <AttractapSerialConfiguratorPin className="flex-1" />
      <AttractapSerialConfiguratorNetwork className="flex-1" />
      <AttractapSerialConfiguratorApi className="w-full" openDeviceSettings={openDeviceSettings} />
    </div>
  );
}

export function AttractapSerialConfigurator(props: Props) {
  const { openDeviceSettings } = props;

  const { t } = useTranslations({
    de,
    en,
  });

  const [error, setError] = useState<ESPToolsResult['error'] | null>(null);
  const espTools = useRef<ESPTools | null>(ESPTools.getInstance());
  const [state, setState] = useState<'idle' | 'connecting' | 'connected' | 'error'>(
    espTools.current?.isConnected ? 'connected' : 'idle',
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
    } catch (err) {
      setError(err as ESPToolsResult['error']);
      setState('error');
    }
  }, []);

  if (state === 'idle') {
    return <Button onPress={connect}>{t('actions.connect')}</Button>;
  }

  if (state === 'connecting') {
    return (
      <div className="flex flex-col items-center justify-center gap-4">
        <ProgressCircle isIndeterminate aria-label={t('connecting.progress.label')}>
        <ProgressCircleTrack>
          <ProgressCircleTrackCircle />
          <ProgressCircleFillCircle />
        </ProgressCircleTrack>
      </ProgressCircle>
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
    <AttractapSerialCommProvider>
      <AttractapSerialCommGate>
        <SerialConfiguratorContent openDeviceSettings={openDeviceSettings} />
      </AttractapSerialCommGate>
    </AttractapSerialCommProvider>
  );
}
