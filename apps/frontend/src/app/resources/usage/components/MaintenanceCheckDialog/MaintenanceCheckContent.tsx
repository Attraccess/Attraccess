import { useState } from 'react';
import { Label, ModalBody, ModalFooter, ModalHeader, ModalHeading, TextArea, TextField } from '@heroui/react';
import { CheckCircle2, MessageSquareWarningIcon } from 'lucide-react';
import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

const MIN_REASON_LENGTH = 3;
const MAX_REASON_LENGTH = 2000;

export interface MaintenanceCheckContentProps {
  onMachineOk: () => void;
  onNeedsMaintenance: (reason: string) => void;
  /** Cancel or close: the session keeps running. */
  onCancel: () => void;
}

/** The question of MaintenanceCheckDialog, and the reason when the machine needs maintenance. */
export function MaintenanceCheckContent({
  onMachineOk,
  onNeedsMaintenance,
  onCancel,
}: Readonly<MaintenanceCheckContentProps>) {
  const { t } = useTranslations({ en, de });
  const [askingReason, setAskingReason] = useState(false);
  const [reason, setReason] = useState('');
  const isReasonValid = reason.trim().length >= MIN_REASON_LENGTH;

  return (
    <>
      <ModalHeader>
        <ModalHeading>{t('title')}</ModalHeading>
      </ModalHeader>

      <ModalBody>
        {askingReason ? (
          <TextField
            value={reason}
            onChange={setReason}
            maxLength={MAX_REASON_LENGTH}
            isRequired
            autoFocus
            className="w-full"
          >
            <Label>{t('reasonLabel')}</Label>
            <TextArea placeholder={t('reasonPlaceholder')} rows={4} className="w-full resize-y" />
          </TextField>
        ) : (
          <p className="text-sm text-muted">{t('description')}</p>
        )}
      </ModalBody>

      {askingReason ? (
        <ModalFooter>
          <Button variant="ghost" onPress={onCancel}>
            {t('cancel')}
          </Button>
          <Button variant="primary" isDisabled={!isReasonValid} onPress={() => onNeedsMaintenance(reason.trim())}>
            {t('continue')}
          </Button>
        </ModalFooter>
      ) : (
        // Stacked: the three buttons do not fit one row, least of all in German or on a phone.
        <ModalFooter className="flex-col">
          <Button fullWidth variant="primary" onPress={onMachineOk}>
            <CheckCircle2 className="w-4 h-4" />
            {t('machineOk')}
          </Button>
          <Button fullWidth variant="secondary" onPress={() => setAskingReason(true)}>
            <MessageSquareWarningIcon className="w-4 h-4" />
            {t('needsMaintenance')}
          </Button>
          <Button fullWidth variant="ghost" onPress={onCancel}>
            {t('cancel')}
          </Button>
        </ModalFooter>
      )}
    </>
  );
}
