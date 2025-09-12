import { memo } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Spinner, Textarea } from '@heroui/react';
import { ResourceUsage } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './translations/en';
import de from './translations/de';
import { DateTimeDisplay } from '@attraccess/plugins-frontend-ui';

interface UsageNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: ResourceUsage | null;
}

export const UsageNotesModal = memo(({ isOpen, onClose, session }: UsageNotesModalProps) => {
  const { t } = useTranslations({ en, de });

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">{t('sessionNotes')}</ModalHeader>
        <ModalBody>
          {session ? (
            <div className="space-y-4">
              <Textarea
                labelPlacement="outside"
                value={session.startNotes || t('noNotesProvided')}
                label={t('startNotes')}
                readOnly
              />

              {session.endTime && (
                <Textarea
                  labelPlacement="outside"
                  value={session.endNotes || t('noNotesProvided')}
                  label={t('endNotes')}
                  readOnly
                />
              )}

              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                <p>
                  {t('sessionStarted')}: <DateTimeDisplay date={session.startTime} />
                </p>
                {session.endTime && (
                  <p>
                    {t('sessionEnded')}: <DateTimeDisplay date={session.endTime} />
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex justify-center py-4">
              <Spinner size="md" color="primary" />
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="primary" variant="light" onPress={onClose}>
            {t('close')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
});

UsageNotesModal.displayName = 'UsageNotesModal';
