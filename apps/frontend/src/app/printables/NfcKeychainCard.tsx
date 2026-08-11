import { useMemo, useState } from 'react';
import { Alert, AlertContent, AlertDescription, AlertTitle, Description, Input, Label, Spinner, TextField } from '@heroui/react';
import { useTranslations, type TFunction } from '@attraccess/plugins-frontend-ui';
import scadSource from './nfc-keychain-card.scad?raw';
import { Button } from '../../components/button';
import { Select } from '../../components/select';
import { AlertStatusIcon } from '../../components/AlertStatusIcon';
import { Preview } from './Preview';
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

export function NfcKeychainCard() {
  const { t } = useTranslations({ de, en });
  const [label, setLabel] = useState('Makerspace');
  const [format, setFormat] = useState<DownloadFormat>('3mf');

  const { status, result, error } = useCardRender(label);
  const errorMessage = resolveErrorMessage(error, t);

  const formatOptions = useMemo(
    () => [
      { key: '3mf', label: t('format3mf') },
      { key: 'stl', label: t('formatStl') },
      { key: 'scad', label: t('formatScad') },
    ],
    [t],
  );

  // The .scad is static source, so it needs no finished render — only the mesh formats do.
  const needsRender = format !== 'scad';

  const handleDownload = () => {
    if (format === 'scad') {
      triggerDownload(scadWithLabel(scadSource, label), `${toFileSlug(label)}.scad`);
      return;
    }
    if (result !== null) downloadCard(result, label, format);
  };

  return (
    <div className="flex w-full flex-col gap-6 lg:flex-row lg:items-start">
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

        {errorMessage !== null && (
          // `role="alert"` makes HeroUI's otherwise-presentational Alert an assertive live
          // region, so screen readers announce it as soon as it mounts.
          <Alert status="danger" role="alert" data-cy="printables-error">
            <AlertStatusIcon status="danger" />
            <AlertContent>
              <AlertTitle>{t('errorTitle')}</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </AlertContent>
          </Alert>
        )}

        <Alert status="accent">
          <AlertStatusIcon status="accent" />
          <AlertContent>
            <AlertDescription>{t('printTip')}</AlertDescription>
          </AlertContent>
        </Alert>

      </div>

      {/* Preview, with the download controls beneath it at the bottom right. */}
      <div className="flex w-full min-w-0 flex-1 flex-col gap-4">
        {/* min-h matches Preview's own height so the first render — when there is no canvas
            yet — still has somewhere to show the spinner instead of collapsing to nothing. */}
        <div className="relative min-h-80 rounded-lg bg-default-100">
          {result !== null && (
            <Preview body={result.body} letters={result.letters} ariaLabel={t('previewAriaLabel')} />
          )}
          {status === 'rendering' && (
            <div className="absolute inset-0 flex items-center justify-center gap-2">
              <Spinner size="sm" />
              <span className="text-sm text-default-500">{t('rendering')}</span>
            </div>
          )}
          {/* A single, permanently-mounted live region rather than putting aria-live on the
              overlay above: the overlay unmounts on completion, so its own removal would never
              be announced. Staying mounted lets this announce both that a render has started
              and, via the text change below, that it has finished. */}
          <span className="sr-only" role="status" aria-live="polite">
            {status === 'rendering' ? t('rendering') : status === 'ready' ? t('renderReady') : ''}
          </span>
        </div>

        <div className="flex flex-wrap items-end justify-end gap-2">
          <Select
            label={t('format')}
            value={format}
            onChange={(key) => setFormat(key as DownloadFormat)}
            items={formatOptions}
            className="w-full sm:w-64"
            data-cy="printables-format-select"
          />
          {/* `result` survives a failed render so the preview keeps showing the last good model,
              which means it can be out of step with the label in the field. Only gate the mesh
              formats on that; the .scad source is independent of any render. */}
          <Button
            isDisabled={needsRender && (result === null || status !== 'ready')}
            onPress={handleDownload}
            data-cy="printables-download"
          >
            {t('download')}
          </Button>
        </div>
      </div>
    </div>
  );
}
