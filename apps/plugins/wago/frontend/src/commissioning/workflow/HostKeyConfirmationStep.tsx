import { Button } from '@attraccess/plugins-frontend-ui';
import { Input, Label, TextField } from '@heroui/react';
import { useState } from 'react';
import { useWagoTranslations } from '../../i18n';

/** Key the step by session so a different session starts with an empty fingerprint. */
export function HostKeyConfirmationStep({
  expectedFingerprint,
  onConfirm,
}: {
  expectedFingerprint: string;
  onConfirm: (fingerprint: string) => void;
}) {
  const { t } = useWagoTranslations();
  const [fingerprint, setFingerprint] = useState('');
  return (
    <details>
      <summary>{t('commissioningUI.trustedFingerprint')}</summary>
      <p className="wg:break-all wg:text-sm">{t('commissioningUI.scannedKey', { fingerprint: expectedFingerprint })}</p>
      <TextField isRequired name="host-key-fingerprint">
        <Label>{t('commissioningUI.reviewedKey')}</Label>
        <Input value={fingerprint} onChange={(event) => setFingerprint(event.target.value)} />
      </TextField>
      <Button
        variant="secondary"
        isDisabled={!fingerprint || fingerprint !== expectedFingerprint}
        onPress={() => onConfirm(fingerprint)}
      >
        {t('commissioningUI.confirmKey')}
      </Button>
    </details>
  );
}
