import { useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  Description,
  Label,
  NumberField,
  Spinner,
  TextField,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import scadSource from './smart-plug-cover.scad?raw';
import { Button } from '../../components/button';
import { Select } from '../../components/select';
import { AlertStatusIcon } from '../../components/AlertStatusIcon';
import { Preview } from './Preview';
import { downloadPlug, plugScadSource, triggerDownload, type DownloadFormat } from './download';
import { type PlugCable, type PlugDevice, usePlugRender } from './usePlugRender';
import de from './de.json';
import en from './en.json';

export function SmartPlugCover() {
  const { t } = useTranslations({ de, en });
  const [device, setDevice] = useState<PlugDevice>('nous_a1');
  const [cable, setCable] = useState<PlugCable>('straight_schuko');
  const [deviceExtraDiameter, setDeviceExtraDiameter] = useState(0);
  const [cordOpeningDiameter, setCordOpeningDiameter] = useState(12);
  const [heightAbovePlug, setHeightAbovePlug] = useState(17.8);
  const [cableCutoutHeight, setCableCutoutHeight] = useState(24.2);
  const [format, setFormat] = useState<DownloadFormat>('3mf');
  const { status, result, error } = usePlugRender(
    device,
    cable,
    deviceExtraDiameter,
    cordOpeningDiameter,
    heightAbovePlug,
    cableCutoutHeight,
  );
  const needsRender = format !== 'scad';
  const formatOptions = useMemo(
    () => [
      { key: '3mf', label: t('format3mf') },
      { key: 'stl', label: t('formatStl') },
      { key: 'scad', label: t('formatScad') },
    ],
    [t],
  );

  const download = () => {
    if (format === 'scad')
      return triggerDownload(
        plugScadSource(
          scadSource,
          device,
          cable,
          deviceExtraDiameter,
          cordOpeningDiameter,
          heightAbovePlug,
          cableCutoutHeight,
        ),
        'attraccess-smart-plug-cover.scad',
      );
    if (result)
      downloadPlug(
        result,
        device,
        cable,
        deviceExtraDiameter,
        cordOpeningDiameter,
        heightAbovePlug,
        cableCutoutHeight,
        format,
      );
  };

  const selectCable = (value: PlugCable) => {
    const angled = value.startsWith('angled');
    setCable(value);
    setCordOpeningDiameter(angled ? 30.9 : value.endsWith('euro') ? 9 : 12);
    if (!angled) {
      setHeightAbovePlug(17.8);
      setCableCutoutHeight(24.2);
    }
  };

  return (
    <div className="flex w-full max-w-[1050px] flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex w-full flex-col gap-4 lg:max-w-sm lg:shrink-0">
        <div>
          <h2 className="text-lg font-medium">{t('plugTitle')}</h2>
          <p className="text-sm text-default-500">{t('plugDescription')}</p>
        </div>
        <TextField>
          <Label>{t('plugDevice')}</Label>
          <Select
            value={device}
            onChange={(key) => setDevice(key as PlugDevice)}
            items={[
              { key: 'nous_a1', label: t('plugNous') },
              { key: 'shelly_plus_gen3', label: t('plugShellyPlusGen3') },
              { key: 'shelly_legacy', label: t('plugShellyLegacy') },
            ]}
          />
          <Description>{t('plugDeviceDescription')}</Description>
        </TextField>
        <NumberField
          value={deviceExtraDiameter}
          onChange={setDeviceExtraDiameter}
          minValue={0}
          maxValue={4}
          step={0.5}
          formatOptions={{ style: 'unit', unit: 'millimeter' }}
        >
          <Label>{t('plugDeviceClearance')}</Label>
          <NumberField.Group>
            <NumberField.DecrementButton />
            <NumberField.Input />
            <NumberField.IncrementButton />
          </NumberField.Group>
          <Description>{t('plugDeviceClearanceDescription')}</Description>
        </NumberField>
        <TextField>
          <Label>{t('plugCable')}</Label>
          <Select
            value={cable}
            onChange={(key) => selectCable(key as PlugCable)}
            items={[
              { key: 'straight_schuko', label: t('cableStraightSchuko') },
              { key: 'straight_euro', label: t('cableStraightEuro') },
              { key: 'angled_schuko', label: t('cableAngledSchuko') },
              { key: 'angled_euro', label: t('cableAngledEuro') },
            ]}
          />
          <Description>{t('plugCableDescription')}</Description>
        </TextField>
        {cable.startsWith('straight') ? (
          <NumberField
            value={cordOpeningDiameter}
            onChange={setCordOpeningDiameter}
            minValue={5}
            maxValue={cable === 'straight_euro' ? 12 : 16}
            step={0.5}
            formatOptions={{ style: 'unit', unit: 'millimeter' }}
          >
            <Label>{t('cordOpeningDiameter')}</Label>
            <NumberField.Group>
              <NumberField.DecrementButton />
              <NumberField.Input />
              <NumberField.IncrementButton />
            </NumberField.Group>
            <Description>{t('cordOpeningDiameterDescription')}</Description>
          </NumberField>
        ) : (
          <>
            <NumberField
              value={heightAbovePlug}
              onChange={setHeightAbovePlug}
              minValue={5}
              maxValue={40}
              step={0.1}
              formatOptions={{ style: 'unit', unit: 'millimeter', minimumFractionDigits: 1 }}
            >
              <Label>{t('heightAbovePlug')}</Label>
              <NumberField.Group>
                <NumberField.DecrementButton />
                <NumberField.Input />
                <NumberField.IncrementButton />
              </NumberField.Group>
              <Description>{t('heightAbovePlugDescription')}</Description>
            </NumberField>
            <NumberField
              value={cableCutoutHeight}
              onChange={setCableCutoutHeight}
              minValue={10}
              maxValue={40}
              step={0.1}
              formatOptions={{ style: 'unit', unit: 'millimeter', minimumFractionDigits: 1 }}
            >
              <Label>{t('cableCutoutHeight')}</Label>
              <NumberField.Group>
                <NumberField.DecrementButton />
                <NumberField.Input />
                <NumberField.IncrementButton />
              </NumberField.Group>
              <Description>{t('cableCutoutHeightDescription')}</Description>
            </NumberField>
          </>
        )}
        {error && (
          <Alert status="danger" role="alert">
            <AlertStatusIcon status="danger" />
            <AlertContent>
              <AlertDescription>{error}</AlertDescription>
            </AlertContent>
          </Alert>
        )}
        <Alert status="accent">
          <AlertStatusIcon status="accent" />
          <AlertContent>
            <AlertDescription>{t('plugPrintTip')}</AlertDescription>
          </AlertContent>
        </Alert>
      </div>
      <div className="flex w-full min-w-0 flex-1 flex-col gap-4">
        <div className="relative min-h-80 rounded-lg bg-default-100">
          {result && (
            <Preview
              body={result.body}
              letters={result.cover}
              center={[0, 0, 22]}
              ariaLabel={t('plugPreviewAriaLabel')}
            />
          )}
          {status === 'rendering' && (
            <div className="absolute inset-0 flex items-center justify-center gap-2">
              <Spinner size="sm" />
              <span className="text-sm text-default-500">{t('rendering')}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-end justify-end gap-2">
          <Select
            label={t('format')}
            value={format}
            onChange={(key) => setFormat(key as DownloadFormat)}
            items={formatOptions}
            className="w-full sm:w-64"
          />
          <Button isDisabled={needsRender && (result === null || status !== 'ready')} onPress={download}>
            {t('download')}
          </Button>
        </div>
      </div>
    </div>
  );
}
