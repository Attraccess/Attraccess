import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Button, Card, CardBody, CardHeader, Progress, Alert, Chip } from '@heroui/react';
import { UsbIcon, WifiIcon, AlertTriangleIcon, CheckCircleIcon, XCircleIcon } from 'lucide-react';
import { AttractapFirmware, OpenAPI } from '@attraccess/react-query-client';
import { getBaseUrl } from '../../../../api';

import de from './de.json';
import en from './en.json';
import { ESPFile, useEspLoader } from 'esptool-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../../hooks/useAuth';

interface Props {
  firmware: AttractapFirmware;
}

export function AttractapFlasher(props: Props) {
  const { firmware } = props;
  const { t } = useTranslations('attractap.installer.flasher', { de, en });

  const downloadFirmware = useCallback(
    async (filename: string): Promise<Blob> => {
      const response = await fetch(
        getBaseUrl() + `/api/attractap/firmware/${firmware.name}/variants/${firmware.variant}/${filename}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${OpenAPI.TOKEN}`,
          },
        }
      );
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();

      return blob;
    },
    [firmware.filename, firmware.name, firmware.variant]
  );

  const { data: firmwareBinary } = useQuery({
    queryKey: ['firmware', firmware.name, firmware.variant, firmware.filename],
    queryFn: () => downloadFirmware(firmware.filename),
  });

  const { state, actions } = useEspLoader();

  const [isConnected, setIsConnected] = useState(false);

  const handleConnect = useCallback(async () => {
    await actions.connect();
    setIsConnected(true);
  }, [actions]);

  const handleFlash = useCallback(async () => {
    if (!firmwareBinary) {
      throw new Error('Firmware binary not yet downloaded');
    }

    const file = await new Promise<ESPFile>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as ArrayBuffer;

        if (!result) {
          reject(new Error('Failed to read firmware file'));
        }

        const uint8Array = new Uint8Array(result);
        const base64 = btoa(String.fromCharCode.apply(null, Array.from(uint8Array)));

        resolve({
          data: base64,
          address: 0,
          fileName: firmware.filename,
        } as ESPFile);
      };
      reader.readAsArrayBuffer(firmwareBinary);
    });

    await actions.program([file]);
  }, [actions, firmwareBinary, firmware.filename]);

  console.log({
    firmwareBinary,
    isConnected,
  });

  if (!firmwareBinary) {
    return (
      <>
        <h1 className="text-2xl font-bold">{t('firmwareIsDownloading')}</h1>
        <Progress isIndeterminate />
      </>
    );
  }

  if (!isConnected) {
    return <Button onPress={handleConnect}>{t('connectDevice')}</Button>;
  }

  return <Button onPress={handleFlash}>{t('flashFirmware')}</Button>;
}
