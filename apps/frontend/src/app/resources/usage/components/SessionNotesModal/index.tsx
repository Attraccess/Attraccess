import { useState } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { Button } from '@heroui/button';
import { Textarea } from '@heroui/input';
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
    <Modal isOpen={isOpen} onOpenChange={onClose} scrollBehavior="inside">
      <ModalContent className="sm:max-w-md">
        <ModalHeader>{mode === SessionModalMode.START ? t('title.start') : t('title.end')}</ModalHeader>

        <ModalBody>
          <div className="space-y-2">
            <label htmlFor="notes" className="text-sm font-medium">
              {t('notesLabel')}
            </label>
            <Textarea
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
          <Button variant="bordered" onPress={onClose} disabled={isSubmitting}>
            {t('cancel')}
          </Button>
          <Button onPress={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? t('processing') : t('confirm')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
