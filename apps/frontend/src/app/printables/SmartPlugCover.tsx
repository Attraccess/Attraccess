import { useState } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import scadSource from './smart-plug-cover.scad?raw';
import { Select } from '../../components/select';
import { DownloadControls } from './DownloadControls';
import { PlugCableFields } from './PlugCableFields';
import { MillimetreField } from './MillimetreField';
import { Preview } from './Preview';
import { PreviewStage } from './PreviewStage';
import { PrintTip } from './PrintTip';
import { RenderErrorAlert } from './RenderErrorAlert';
import { triggerDownload, type DownloadFormat } from './download';
import { downloadPlug, plugFileSlug, plugScadSource } from './plugDownload';
import { NO_OUTPUT_ERROR } from './errors';
import {
  DEFAULT_PLUG_CONFIG,
  DEVICE_EXTRA_DIAMETER_LIMITS,
  withCable,
  type PlugCable,
  type PlugConfig,
  type PlugDevice,
} from './smartPlugConfig';
import { usePlugRender } from './usePlugRender';
import de from './de.json';
import en from './en.json';

/** Configurator for the two-part smart-plug security cover. */
export function SmartPlugCover() {
  const { t } = useTranslations({ de, en });
  const [config, setConfig] = useState<PlugConfig>(DEFAULT_PLUG_CONFIG);
  const [format, setFormat] = useState<DownloadFormat>('3mf');
  const { status, result, error } = usePlugRender(config);
  const update = (change: Partial<PlugConfig>) => setConfig((current) => ({ ...current, ...change }));

  const handleDownload = () => {
    if (format === 'scad') {
      triggerDownload(plugScadSource(scadSource, config), `${plugFileSlug(config)}.scad`);
      return;
    }
    if (result !== null) downloadPlug(result, config, format);
  };

  return (
    <div className="flex w-full max-w-[1050px] flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex w-full flex-col gap-4 lg:max-w-sm lg:shrink-0">
        <div>
          <h2 className="text-lg font-medium">{t('plugTitle')}</h2>
          <p className="text-sm text-default-500">{t('plugDescription')}</p>
        </div>

        <Select
          label={t('plugDevice')}
          description={t('plugDeviceDescription')}
          value={config.device}
          onChange={(device) => update({ device: device as PlugDevice })}
          items={[
            { key: 'nous_a1', label: t('plugNous') },
            { key: 'shelly_plus_gen3', label: t('plugShellyPlusGen3') },
            { key: 'shelly_legacy', label: t('plugShellyLegacy') },
          ]}
          data-cy="printables-plug-device"
        />
        <MillimetreField
          label={t('plugDeviceClearance')}
          description={t('plugDeviceClearanceDescription')}
          value={config.deviceExtraDiameter}
          onChange={(deviceExtraDiameter) => update({ deviceExtraDiameter })}
          limits={DEVICE_EXTRA_DIAMETER_LIMITS}
          data-cy="printables-plug-clearance"
        />
        <Select
          label={t('plugCable')}
          description={t('plugCableDescription')}
          value={config.cable}
          onChange={(cable) => setConfig((current) => withCable(current, cable as PlugCable))}
          items={[
            { key: 'straight_schuko', label: t('cableStraightSchuko') },
            { key: 'straight_euro', label: t('cableStraightEuro') },
            { key: 'angled_schuko', label: t('cableAngledSchuko') },
            { key: 'angled_euro', label: t('cableAngledEuro') },
          ]}
          data-cy="printables-plug-cable"
        />
        <PlugCableFields config={config} onChange={update} />

        {error !== null && (
          <RenderErrorAlert
            title={t('errorTitle')}
            message={error === NO_OUTPUT_ERROR ? t('plugErrorNoOutput') : error}
          />
        )}

        <PrintTip>{t('plugPrintTip')}</PrintTip>
      </div>

      <div className="flex w-full min-w-0 flex-1 flex-col gap-4">
        <PreviewStage status={status}>
          {result !== null && (
            <Preview body={result.body} accent={result.cover} ariaLabel={t('plugPreviewAriaLabel')} />
          )}
        </PreviewStage>
        <DownloadControls
          format={format}
          onFormatChange={setFormat}
          meshReady={result !== null && status === 'ready'}
          onDownload={handleDownload}
        />
      </div>
    </div>
  );
}
