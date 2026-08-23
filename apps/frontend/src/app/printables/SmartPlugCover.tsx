import { useMemo, useState } from 'react';
import { Alert, AlertContent, AlertDescription, Description, Label, Spinner, TextField } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import scadSource from './smart-plug-cover.scad?raw';
import { Button } from '../../components/button';
import { Select } from '../../components/select';
import { AlertStatusIcon } from '../../components/AlertStatusIcon';
import { Preview } from './Preview';
import { downloadPlug, triggerDownload, type DownloadFormat } from './download';
import { type PlugCable, type PlugDevice, usePlugRender } from './usePlugRender';
import de from './de.json';
import en from './en.json';

export function SmartPlugCover() {
  const { t } = useTranslations({ de, en });
  const [device, setDevice] = useState<PlugDevice>('nous_a1');
  const [cable, setCable] = useState<PlugCable>('straight_schuko');
  const [format, setFormat] = useState<DownloadFormat>('3mf');
  const { status, result, error } = usePlugRender(device, cable);
  const needsRender = format !== 'scad';
  const formatOptions = useMemo(() => [
    { key: '3mf', label: t('format3mf') }, { key: 'stl', label: t('formatStl') }, { key: 'scad', label: t('formatScad') },
  ], [t]);

  const download = () => {
    if (format === 'scad') return triggerDownload(scadSource, 'attraccess-smart-plug-cover.scad');
    if (result) downloadPlug(result, device, cable, format);
  };

  return (
    <div className="flex w-full max-w-[1050px] flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex w-full flex-col gap-4 lg:max-w-sm lg:shrink-0">
        <div><h2 className="text-lg font-medium">{t('plugTitle')}</h2><p className="text-sm text-default-500">{t('plugDescription')}</p></div>
        <TextField><Label>{t('plugDevice')}</Label><Select value={device} onChange={(key) => setDevice(key as PlugDevice)} items={[{ key: 'nous_a1', label: t('plugNous') }, { key: 'shelly_plus', label: t('plugShelly') }]} /><Description>{t('plugDeviceDescription')}</Description></TextField>
        <TextField><Label>{t('plugCable')}</Label><Select value={cable} onChange={(key) => setCable(key as PlugCable)} items={[{ key: 'straight_schuko', label: t('cableStraightSchuko') }, { key: 'straight_euro', label: t('cableStraightEuro') }, { key: 'angled_schuko', label: t('cableAngledSchuko') }, { key: 'angled_euro', label: t('cableAngledEuro') }]} /></TextField>
        {error && <Alert status="danger" role="alert"><AlertStatusIcon status="danger" /><AlertContent><AlertDescription>{error}</AlertDescription></AlertContent></Alert>}
        <Alert status="accent"><AlertStatusIcon status="accent" /><AlertContent><AlertDescription>{t('plugPrintTip')}</AlertDescription></AlertContent></Alert>
      </div>
      <div className="flex w-full min-w-0 flex-1 flex-col gap-4">
        <div className="relative min-h-80 rounded-lg bg-default-100">
          {result && <Preview body={result.body} letters={result.cover} center={[0, 0, 22]} ariaLabel={t('plugPreviewAriaLabel')} />}
          {status === 'rendering' && <div className="absolute inset-0 flex items-center justify-center gap-2"><Spinner size="sm" /><span className="text-sm text-default-500">{t('rendering')}</span></div>}
        </div>
        <div className="flex flex-wrap items-end justify-end gap-2"><Select label={t('format')} value={format} onChange={(key) => setFormat(key as DownloadFormat)} items={formatOptions} className="w-full sm:w-64" /><Button isDisabled={needsRender && (result === null || status !== 'ready')} onPress={download}>{t('download')}</Button></div>
      </div>
    </div>
  );
}
