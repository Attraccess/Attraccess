import { ModalHeader, ModalBody, ModalFooter, ModalHeading } from '@heroui/react';
import { Button } from '@heroui/react';
import { StandardModal } from '../standardModal';
import { useTranslations, I18nTransComponent } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => unknown;
  itemName: string;
  isDeleting?: boolean;
}

export function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  itemName,
  isDeleting,
}: Readonly<DeleteConfirmationModalProps>) {
  const { t } = useTranslations({
    en,
    de,
  });

  return (
    <StandardModal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="sm"
    >
      {({ close }) => (
        <>
          <ModalHeader>
            <ModalHeading>{t('title')}</ModalHeading>
          </ModalHeader>
          <ModalBody>
            <div className="text-lg">
              <I18nTransComponent
                t={t}
                count={1}
                i18nKey="message"
                values={{ itemName }}
                components={{
                  br: <br />,
                  bold: <span className="text-2xl font-bold block my-4" />,
                  alert: (
                    <div className="text-red-500 bg-red-100 p-2 rounded-md dark:bg-red-900 dark:text-red-100 mt-8" />
                  ),
                }}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onPress={close} data-cy="cancel-button">
              {t('cancelButton')}
            </Button>
            <Button variant="danger" data-cy="delete-button" onPress={() => onConfirm()} isPending={isDeleting}>
              {t('deleteButton')}
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
