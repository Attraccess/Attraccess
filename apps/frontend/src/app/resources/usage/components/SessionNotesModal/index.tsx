import { useState } from 'react';
import { Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalFooter, ModalHeader, ModalHeading } from '@heroui/react';
import { Button } from '@heroui/react';
import { TextArea } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './translations/en';
import de from './translations/de';

export enum SessionModalMode {
  START = 'start',
  END = 'end',
}

export type SessionNotesModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => void;
  mode: SessionModalMode;
  isSubmitting: boolean;
};

export const SessionNotesModal = ({ isOpen, onClose, onConfirm, mode, isSubmitting }: SessionNotesModalProps) => {
  const { t } = useTranslations({ en, de });
  const [notes, setNotes] = useState('');

  const handleConfirm = () => {
    onConfirm(notes);
    setNotes(''); // Reset notes after submission
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalBackdrop />
      <ModalContainer className="sm:max-w-md">
        <ModalDialog>
          {({ close }) => (
            <>
              <ModalHeader>
                <ModalHeading>{mode === SessionModalMode.START ? t('title.start') : t('title.end')}</ModalHeading>
              </ModalHeader>

              <ModalBody>
                <div className="space-y-2">
                  <label htmlFor="notes" className="text-sm font-medium">
                    {t('notesLabel')}
                  </label>
                  <TextArea
                    id="notes"
                    placeholder={t('notesPlaceholder')}
                    value={notes}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotes(e.target.value)}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500">{t('notesOptional')}</p>
                </div>
              </ModalBody>

              <ModalFooter>
                <Button variant="outline" onPress={close} isDisabled={isSubmitting}>
                  {t('cancel')}
                </Button>
                <Button onPress={handleConfirm} isDisabled={isSubmitting}>
                  {isSubmitting ? t('processing') : t('confirm')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalDialog>
      </ModalContainer>
    </Modal>
  );
};
