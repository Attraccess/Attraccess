import { useState } from 'react';
import { Label, ModalBody, ModalFooter, ModalHeader, ModalHeading, TextArea, TextField } from '@heroui/react';
import { CheckCircle2, MessageSquareWarningIcon } from 'lucide-react';
import { Button, StandardModal, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

const MIN_REASON_LENGTH = 3;
const MAX_REASON_LENGTH = 2000;

interface MaintenanceCheckDialogProps {
  isOpen: boolean;
  onMachineOk: () => void;
  onNeedsMaintenance: (reason: string) => void;
  /** Cancel or close: the session keeps running. */
  onCancel: () => void;
}

/** "Is the machine OK?", asked before a user ends their own session. "Needs maintenance" asks for the reason. */
export function MaintenanceCheckDialog({ isOpen, ...content }: Readonly<MaintenanceCheckDialogProps>) {
  return (
    <StandardModal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) content.onCancel();
      }}
      size="md"
      data-cy="maintenance-check-dialog"
    >
      {/* Mounted per opening, so every check starts with the question and an empty reason. */}
      <MaintenanceCheckContent {...content} />
    </StandardModal>
  );
}

function MaintenanceCheckContent({
  onMachineOk,
  onNeedsMaintenance,
  onCancel,
}: Readonly<Omit<MaintenanceCheckDialogProps, 'isOpen'>>) {
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

      <ModalFooter className="flex-wrap">
        <Button variant="ghost" onPress={onCancel}>
          {t('cancel')}
        </Button>
        {askingReason ? (
          <Button variant="primary" isDisabled={!isReasonValid} onPress={() => onNeedsMaintenance(reason.trim())}>
            {t('continue')}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onPress={() => setAskingReason(true)}>
              <MessageSquareWarningIcon className="w-4 h-4" />
              {t('needsMaintenance')}
            </Button>
            <Button variant="primary" onPress={onMachineOk}>
              <CheckCircle2 className="w-4 h-4" />
              {t('machineOk')}
            </Button>
          </>
        )}
      </ModalFooter>
    </>
  );
}
