import { Button, Input, Label, TextField } from '@heroui/react';
import { CameraIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ResourceScanner } from '../../resourceOverview/toolbar/scanner';
import { enrollmentCodeFromScan, formatEnrollmentCode } from './enrollmentCode';
import { PairingFlow } from './usePairingFlow';
import de from './de.json';
import en from './en.json';

export function CodeField({ flow, insecure }: Readonly<{ flow: PairingFlow; insecure: boolean }>) {
  const { t } = useTranslations({ de, en });
  const scan = (raw: string) => {
    const scanned = enrollmentCodeFromScan(raw);
    if (scanned) flow.setCodeFromScan(formatEnrollmentCode(scanned));
    return scanned !== null;
  };
  return (
    <div className="flex items-end gap-2">
      <TextField className="min-w-0 grow" value={flow.codeInput} onChange={flow.setCodeInput} isDisabled={!flow.idle}>
        <Label>{t('dialog.codeLabel')}</Label>
        <Input
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={16}
          placeholder="K7P-3XQ"
          className="font-mono tracking-widest"
          data-cy="attractap-pairing-code-input"
        />
      </TextField>
      {!insecure && (
        <ResourceScanner title={t('dialog.scanTitle')} onDetected={scan} cameraFallbackHint={t('dialog.scanFallback')}>
          {(open) => (
            <Button variant="secondary" className="shrink-0" onPress={open} data-cy="attractap-pairing-scan">
              <CameraIcon className="size-4" />
              {t('dialog.scan')}
            </Button>
          )}
        </ResourceScanner>
      )}
    </div>
  );
}
