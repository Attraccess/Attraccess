import { Button, ModalHeading, ModalBody, ModalFooter, ModalHeader } from '@heroui/react';
import { StandardModal } from '../../../components/standardModal';
import { useCallback, useState } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAttractapServiceResetNfcCard } from '@attraccess/react-query-client';
import { AttractapSelect } from '../AttractapSelect';
import { useToastMessage } from '../../../components/toastProvider';
import de from './de.json';
import en from './en.json';
import { DeleteModalProps } from './index.delete-modal-props';

export const NfcCardDeleteModal = (props: DeleteModalProps) => {
  const { t } = useTranslations({
    de,
    en,
  });

  const [readerId, setReaderId] = useState<number | null>(null);

  const toast = useToastMessage();
  const { mutate: resetNfcCard, isPending } = useAttractapServiceResetNfcCard({
    onSuccess: props.close,
    onError: (error) => toast.error({ title: t('errorOperation'), description: (error as Error).message }),
  });

  const deleteCard = useCallback(() => {
    if (!props.cardId || !readerId) {
      return;
    }

    resetNfcCard({ requestBody: { readerId, cardId: props.cardId } });
  }, [props.cardId, resetNfcCard, readerId]);

  return (
    <StandardModal
      isOpen={props.show}
      onOpenChange={(open) => {
        if (!open) props.close();
      }}
      data-cy="nfc-card-delete-modal"
      size="md"
      dialogProps={{ 'aria-label': t('nfcCardsTable.deleteModal.title') }}
    >
      {({ close }) => (
        <>
          <ModalHeader>
            <ModalHeading>{t('nfcCardsTable.deleteModal.title')}</ModalHeading>
          </ModalHeader>
          <ModalBody>
            <p>{t('nfcCardsTable.deleteModal.description', { id: props.cardId })}</p>
            <AttractapSelect
              label={t('nfcCardsTable.deleteModal.readerLabel')}
              placeholder={t('nfcCardsTable.deleteModal.readerPlaceholder')}
              selection={readerId}
              onSelectionChange={(readerId) => setReaderId(readerId ?? null)}
              data-cy="nfc-card-delete-modal-reader-select"
            />
          </ModalBody>
          <ModalFooter>
            <Button onPress={close} data-cy="nfc-card-delete-modal-cancel-button">
              {t('nfcCardsTable.deleteModal.cancel')}
            </Button>
            <Button
              variant="danger"
              isDisabled={!readerId || isPending}
              isPending={isPending}
              onPress={deleteCard}
              data-cy="nfc-card-delete-modal-delete-button"
            >
              {t('nfcCardsTable.deleteModal.delete')}
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
};
