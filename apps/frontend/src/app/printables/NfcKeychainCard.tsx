import { useMemo, useState } from 'react';
import { Alert, AlertContent, AlertDescription, AlertTitle, Card, Description, Input, Label, Spinner, TextField } from '@heroui/react';
import { useTranslations, type TFunction } from '@attraccess/plugins-frontend-ui';
import scadSource from './nfc-keychain-card.scad?raw';
import { Button } from '../../components/button';
import { Select } from '../../components/select';
import { AlertStatusIcon } from '../../components/AlertStatusIcon';
import { Preview } from './Preview';
import { downloadCard, triggerDownload } from './download';
import { useCardRender } from './useCardRender';
import { NO_OUTPUT_ERROR } from './errors';
import de from './de.json';
import en from './en.json';

type Format = 'stl' | '3mf';

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
  const [format, setFormat] = useState<Format>('3mf');

  const { status, result, error } = useCardRender(label);
  const errorMessage = resolveErrorMessage(error, t);

  const formatOptions = useMemo(
    () => [
      { key: '3mf', label: t('format3mf') },
      { key: 'stl', label: t('formatStl') },
    ],
    [t],
  );

  return (
    <Card className="w-full">
      <Card.Header>
        <Card.Title>{t('cardTitle')}</Card.Title>
        <Card.Description>{t('cardDescription')}</Card.Description>
      </Card.Header>

      <Card.Content className="flex flex-col gap-4">
        <TextField value={label} onChange={setLabel}>
          <Label>{t('labelField')}</Label>
          <Input placeholder={t('labelPlaceholder')} data-cy="printables-label-input" />
          <Description>{t('labelDescription')}</Description>
        </TextField>

        <Select
          label={t('format')}
          value={format}
          onChange={(key) => setFormat(key as Format)}
          items={formatOptions}
          data-cy="printables-format-select"
        />

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

        <Alert status="accent">
          <AlertStatusIcon status="accent" />
          <AlertContent>
            <AlertDescription>{t('printTip')}</AlertDescription>
          </AlertContent>
        </Alert>
      </Card.Content>

      <Card.Footer className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onPress={() => triggerDownload(scadSource, 'nfc-keychain-card.scad')}
          data-cy="printables-download-scad"
        >
          {t('downloadScad')}
        </Button>
        {/* `result` survives a failed render so the preview keeps showing the last good model,
            which means it can be out of step with the label in the field. Only offer the
            download while the render on screen actually matches what was typed. */}
        <Button
          isDisabled={result === null || status !== 'ready'}
          onPress={() => result !== null && downloadCard(result, label, format)}
          data-cy="printables-download"
        >
          {t('download')}
        </Button>
      </Card.Footer>
    </Card>
  );
}
