import { Button, Input, Label, TextField } from '@heroui/react';
import { useWagoTranslations } from './i18n';

export function HostKeyConfirmationStep({
  fingerprint,
  expectedFingerprint,
  onFingerprintChange,
  onConfirm,
}: {
  fingerprint: string;
  expectedFingerprint: string;
  onFingerprintChange: (value: string) => void;
  onConfirm: () => void;
}) {
  const { t } = useWagoTranslations();
  return (
    <details>
      <summary>{t('commissioningUI.trustedFingerprint')}</summary>
      <p className="wg:break-all wg:text-sm">{t('commissioningUI.scannedKey', { fingerprint: expectedFingerprint })}</p>
      <TextField isRequired name="host-key-fingerprint">
        <Label>{t('commissioningUI.reviewedKey')}</Label>
        <Input value={fingerprint} onChange={(event) => onFingerprintChange(event.target.value)} />
      </TextField>
      <Button variant="secondary" isDisabled={!fingerprint || fingerprint !== expectedFingerprint} onPress={onConfirm}>
        {t('commissioningUI.confirmKey')}
      </Button>
    </details>
  );
}
