import { useMemo, useState } from 'react';
import { Alert, AlertContent, AlertDescription, AlertTitle, Card, Description, Input, Label, Spinner, TextField } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import scadSource from './nfc-keychain-card.scad?raw';
import { Button } from '../../components/button';
import { Select } from '../../components/select';
import { AlertStatusIcon } from '../../components/AlertStatusIcon';
import { Preview } from './Preview';
import { downloadCard, triggerDownload } from './download';
import { useCardRender } from './useCardRender';
import de from './de.json';
import en from './en.json';

type Format = 'stl' | '3mf';

export function NfcKeychainCard() {
  const { t } = useTranslations({ de, en });
  const [label, setLabel] = useState('Makerspace');
  const [format, setFormat] = useState<Format>('3mf');

  const { status, result, error } = useCardRender(label);

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

        {error !== null && (
          <Alert status="danger" data-cy="printables-error">
            <AlertStatusIcon status="danger" />
            <AlertContent>
              <AlertTitle>{t('errorTitle')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </AlertContent>
          </Alert>
        )}

        {/* min-h matches Preview's own height so the first render — when there is no canvas
            yet — still has somewhere to show the spinner instead of collapsing to nothing. */}
        <div className="relative min-h-80 rounded-lg bg-default-100">
          {result !== null && <Preview body={result.body} letters={result.letters} />}
          {status === 'rendering' && (
            <div className="absolute inset-0 flex items-center justify-center gap-2">
              <Spinner size="sm" />
              <span className="text-sm text-default-500">{t('rendering')}</span>
            </div>
          )}
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
