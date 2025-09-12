import { AttractapFirmware, useAttractapServiceGetFirmwareBinary } from '@attraccess/react-query-client';
import { ESPTools, ESPToolsErrorType } from '../../../../utils/esp-tools';
import { Accordion, AccordionItem, Alert, Button, CircularProgress, Progress } from '@heroui/react';
import { useCallback, useState } from 'react';
import { useToastMessage } from '../../../../components/toastProvider';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Terminal } from '../../../../components/Terminal';

import de from './de.json';
import en from './en.json';

interface Props {
  firmware: AttractapFirmware;
  onCompleted: () => unknown;
}

export function FirmwareFlasher(props: Props) {
  const { data: firmwareBinary, isLoading: isDownloadingFirmware } = useAttractapServiceGetFirmwareBinary({
    firmwareName: props.firmware.name,
    variantName: props.firmware.variant,
    filename: props.firmware.filename,
  });

  const { t } = useTranslations({
    de,
    en,
  });

  const toast = useToastMessage();

  const [flashProgress, setFlashProgress] = useState<number>(0);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [flashError, setFlashError] = useState<{ type: ESPToolsErrorType; details?: unknown } | null>(null);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);

  const flashFirmware = useCallback(async () => {
    if (!firmwareBinary) {
      return;
    }

    setIsFlashing(true);
    setFlashError(null);
    setFlashProgress(0);

    const espTools = ESPTools.getInstance();

    // Connect to device
    const connectionResult = await espTools.connectToDevice();
    if (!connectionResult.success) {
      setFlashError(connectionResult.error);
      setIsFlashing(false);
      return;
    }

    // Flash firmware
    const flashResult = await espTools.flashFirmware({
      firmware: firmwareBinary as unknown as Blob,
      onProgress: (progressPct) => {
        setFlashProgress(progressPct);
        if (progressPct === 100) {
          toast.success({
            title: t('success.toast.title'),
            description: t('success.toast.description'),
          });
          setIsFlashing(false);
          props.onCompleted();
        }
      },
      terminal: {
        clean: () => {
          setLogLines([]);
        },
        write: (line) => {
          setLogLines((prev) => {
            if (prev.length === 0) {
              return [line];
            }
            const lastLine = prev[prev.length - 1];
            return [...prev.slice(0, -1), `${lastLine} ${line}`];
          });
        },
        writeLine: (line) => {
          setLogLines((prev) => [...prev, line]);
        },
      },
    });

    if (!flashResult.success) {
      setFlashError(flashResult.error);
      setIsFlashing(false);
    }
  }, [firmwareBinary, props, toast, t]);

  if (isDownloadingFirmware) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <CircularProgress isIndeterminate label={t('downloading.label')} />
      </div>
    );
  }

  if (flashProgress === 0 && logLines.length === 0 && !flashError) {
    return (
      <div className="space-y-4">
        <Button isLoading={isFlashing} onPress={flashFirmware} color="primary">
          {t('action.flash')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {flashError && (
        <Alert title={t('errors.' + flashError.type)} color="danger" className="flex-row flex-wrap flex-gap-2">
          <div>{(flashError.details as string) || 'Unknown error occurred'}</div>

          <Button size="sm" color="primary" onPress={flashFirmware}>
            {t('action.retryFlash')}
          </Button>
        </Alert>
      )}

      {!flashError && (
        <Progress
          isIndeterminate={flashProgress === 0}
          value={flashProgress}
          minValue={0}
          maxValue={100}
          showValueLabel={true}
        />
      )}

      <Accordion>
        <AccordionItem key="terminal" title={t('terminal.title')}>
          <Terminal logLines={logLines} maxHeight="30vh" />
        </AccordionItem>
      </Accordion>
    </div>
  );
}
