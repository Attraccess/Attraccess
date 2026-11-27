import { useState } from 'react';
import { Description, Input, Label, TextField } from '@heroui/react';
import { type TFunction, useTranslations } from '@attraccess/plugins-frontend-ui';
import scadSource from './rfid-keychain-card.scad?raw';
import { DownloadControls } from './DownloadControls';
import { Preview } from './Preview';
import { PreviewStage } from './PreviewStage';
import { PrintTip } from './PrintTip';
import { RenderErrorAlert } from './RenderErrorAlert';
import { downloadCard, scadWithLabel, toFileSlug, triggerDownload } from './download';
import { useCardRender } from './useCardRender';
import { NO_OUTPUT_ERROR } from './errors';
import de from './de.json';
import en from './en.json';

import type { DownloadFormat } from './download';

/**
 * The worker reports `NO_OUTPUT_ERROR` — a stable, non-prose reason code — for a render that
 * produced no file at all (rather than an OpenSCAD assert() message, which is already
 * user-facing text). Map it to a translated string here; any other error string is OpenSCAD's
 * own assert() message, which comes out in English and is surfaced as-is (see
 * `renderErrorReason` in openscad.worker.ts).
 */
export function resolveErrorMessage(error: string | null, t: TFunction): string | null {
  if (error === null) return null;
  return error === NO_OUTPUT_ERROR ? t('errorNoOutput') : error;
}

export function RfidKeychainCard() {
  const { t } = useTranslations({ de, en });
  const [label, setLabel] = useState('Tobias J.');
  const [format, setFormat] = useState<DownloadFormat>('3mf');

  const { status, result, error } = useCardRender(label);
  const errorMessage = resolveErrorMessage(error, t);

  const handleDownload = () => {
    if (format === 'scad') {
      triggerDownload(scadWithLabel(scadSource, label), `${toFileSlug(label)}.scad`);
      return;
    }
    if (result !== null) downloadCard(result, label, format);
  };

  return (
    <div className="flex w-full max-w-[1050px] flex-col gap-6 lg:flex-row lg:items-start">
      {/* Configuration — plain column, deliberately not a Card. */}
      <div className="flex w-full flex-col gap-4 lg:max-w-sm lg:shrink-0">
        <div>
          <h2 className="text-lg font-medium">{t('cardTitle')}</h2>
          <p className="text-sm text-default-500">{t('cardDescription')}</p>
        </div>

        <TextField value={label} onChange={setLabel}>
          <Label>{t('labelField')}</Label>
          <Input placeholder={t('labelPlaceholder')} data-cy="printables-label-input" />
          <Description>{t('labelDescription')}</Description>
        </TextField>

        {errorMessage !== null && <RenderErrorAlert title={t('errorTitle')} message={errorMessage} />}

        <PrintTip>{t('printTip')}</PrintTip>
      </div>

      {/* Preview, with the download controls beneath it at the bottom right. */}
      <div className="flex w-full min-w-0 flex-1 flex-col gap-4">
        <PreviewStage status={status}>
          {result !== null && <Preview body={result.body} accent={result.letters} ariaLabel={t('previewAriaLabel')} />}
        </PreviewStage>

        {/* `result` survives a failed render so the preview keeps showing the last good model,
            which means it can be out of step with the label in the field. Only offer the mesh
            formats while the render matches it. */}
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
