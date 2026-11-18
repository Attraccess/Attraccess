import { AttractapFirmware, useGetFirmwareBinary } from '@attraccess/react-query-client';
import { ESPTools, ESPToolsErrorType } from '../../../../utils/esp-tools';
import {
  Accordion,
  AccordionItem,
  AccordionHeading,
  AccordionTrigger,
  AccordionPanel,
  AccordionBody,
  Alert,
  AlertContent,
  AlertTitle,
  ProgressBar,
  ProgressBarFill,
  ProgressBarTrack,
  ProgressCircle,
  ProgressCircleFillCircle,
  ProgressCircleTrack,
  ProgressCircleTrackCircle,
} from '@heroui/react';
import { useCallback, useState } from 'react';
import { useToastMessage } from '../../../../components/toastProvider';
import { Button, StatusDialog, useTranslations } from '@attraccess/plugins-frontend-ui';
import { Terminal } from '../../../../components/Terminal';

import de from './de.json';
import en from './en.json';

interface Props {
  firmware: AttractapFirmware;
  onCompleted: () => unknown;
}

export function FirmwareFlasher(props: Props) {
  const { data: firmwareBinary, isLoading: isDownloadingFirmware } = useGetFirmwareBinary({
    path: { firmwareName: props.firmware.name, variantName: props.firmware.variant, filename: props.firmware.filename },
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
  // The BLE Bridge has no auto-reset wiring: the user opens it, wires a USB-TTL adapter and power-cycles it by hand.
  const bleBridge = props.firmware.bleBridge === true;
  const [isBridgeWarningOpen, setIsBridgeWarningOpen] = useState(false);
  const [isPowerCycleOpen, setIsPowerCycleOpen] = useState(false);
  const [chipMismatch, setChipMismatch] = useState<{ expected: string; detected: string } | null>(null);

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

    // Flash firmware with parameters from firmware metadata
    const flashResult = await espTools.flashFirmware({
      firmware: firmwareBinary as unknown as Blob,
      flashMode: props.firmware.flashMode as import('esptool-js').FlashModeValues | undefined,
      flashFreq: props.firmware.flashFreq as import('esptool-js').FlashFreqValues | undefined,
      flashSize: props.firmware.flashSize as import('esptool-js').FlashSizeValues | undefined,
      chip: props.firmware.chip,
      manualDownloadMode: bleBridge,
      onProgress: (progressPct) => {
        setFlashProgress(progressPct);
        if (progressPct === 100) {
          toast.success({
            title: t('success.toast.title'),
            description: t('success.toast.description'),
          });
          setIsFlashing(false);
          if (bleBridge) setIsPowerCycleOpen(true);
          else props.onCompleted();
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
      if (flashResult.error?.type === ESPToolsErrorType.CHIP_MISMATCH) {
        const detected = (flashResult.error.details as { detected: string }).detected;
        // Name the expected chip like the firmware list and the detected one (ESP32-S3), not by its build id.
        const chips = { expected: props.firmware.boardFamily || props.firmware.chip || '', detected };
        setChipMismatch(chips);
        setFlashError({ type: ESPToolsErrorType.CHIP_MISMATCH, details: t('chipMismatch.description', chips) });
      } else {
        setFlashError(flashResult.error);
      }
      setIsFlashing(false);
    }
  }, [firmwareBinary, props, toast, t, bleBridge]);

  const startFlash = useCallback(() => {
    if (bleBridge) setIsBridgeWarningOpen(true);
    else void flashFirmware();
  }, [bleBridge, flashFirmware]);

  const dialogs = (
    <>
      <StatusDialog
        isOpen={isBridgeWarningOpen}
        onClose={() => setIsBridgeWarningOpen(false)}
        status="warning"
        title={t('bridgeWarning.title')}
        action={{
          label: t('bridgeWarning.confirm'),
          onPress: () => {
            setIsBridgeWarningOpen(false);
            void flashFirmware();
          },
          'data-cy': 'firmware-flasher-bridge-confirm',
        }}
        data-cy="firmware-flasher-bridge-warning"
      >
        <div className="flex flex-col gap-2">
          <p className="font-semibold">{t('bridgeWarning.power')}</p>
          <p>{t('bridgeWarning.wiring')}</p>
          <p>{t('bridgeWarning.downloadMode')}</p>
          <a href={t('bridgeWarning.docsUrl')} target="_blank" rel="noreferrer" className="text-accent underline">
            {t('bridgeWarning.docsLink')}
          </a>
        </div>
      </StatusDialog>
      <StatusDialog
        isOpen={isPowerCycleOpen}
        onClose={() => {
          setIsPowerCycleOpen(false);
          props.onCompleted();
        }}
        status="info"
        title={t('powerCycle.title')}
        action={{
          label: t('powerCycle.continue'),
          onPress: () => {
            setIsPowerCycleOpen(false);
            props.onCompleted();
          },
          'data-cy': 'firmware-flasher-power-cycle-continue',
        }}
        data-cy="firmware-flasher-power-cycle"
      >
        {t('powerCycle.description')}
      </StatusDialog>
      <StatusDialog
        isOpen={chipMismatch !== null}
        onClose={() => setChipMismatch(null)}
        status="error"
        title={t('chipMismatch.title')}
        data-cy="firmware-flasher-chip-mismatch"
      >
        {chipMismatch ? t('chipMismatch.description', chipMismatch) : undefined}
      </StatusDialog>
    </>
  );

  if (isDownloadingFirmware) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <ProgressCircle isIndeterminate aria-label={t('downloading.label')}>
          <ProgressCircleTrack>
            <ProgressCircleTrackCircle />
            <ProgressCircleFillCircle />
          </ProgressCircleTrack>
        </ProgressCircle>
      </div>
    );
  }

  if (flashProgress === 0 && logLines.length === 0 && !flashError) {
    return (
      <div className="space-y-4">
        <Button variant="primary" isPending={isFlashing} onPress={startFlash}>
          {t('action.flash')}
        </Button>
        {dialogs}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {flashError && (
        <Alert status="danger" className="flex-row flex-wrap flex-gap-2">
          <AlertContent>
            <AlertTitle>{t('errors.' + flashError.type)}</AlertTitle>
          </AlertContent>
          <div>{(flashError.details as string) || 'Unknown error occurred'}</div>

          <Button variant="primary" onPress={startFlash}>
            {t('action.retryFlash')}
          </Button>
        </Alert>
      )}

      {!flashError && (
        <ProgressBar isIndeterminate={flashProgress === 0} value={flashProgress} minValue={0} maxValue={100}>
          <ProgressBarTrack>
            <ProgressBarFill />
          </ProgressBarTrack>
        </ProgressBar>
      )}

      {dialogs}

      <Accordion>
        <AccordionItem key="terminal" id="terminal">
          <AccordionHeading>
            <AccordionTrigger>{t('terminal.title')}</AccordionTrigger>
          </AccordionHeading>
          <AccordionPanel>
            <AccordionBody>
              <Terminal logLines={logLines} maxHeight="30vh" />
            </AccordionBody>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
