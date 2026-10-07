import { Button } from '@heroui/react';
import { DrawerBody } from '@heroui/react';
import { DrawerFooter } from '@heroui/react';
import { DrawerHeader } from '@heroui/react';
import { StandardDrawer } from '../../../components/standardDrawer';
import { useCallback } from 'react';
import { useState } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAttractapServiceEnrollNfcCard } from '@attraccess/react-query-client';
import { AttractapSelect } from '../AttractapSelect';
import de from './de.json';
import en from './en.json';
import { XIcon } from 'lucide-react';
import type { EnrollNfcCardProps } from './index.contracts';
import { ModalBody } from '@heroui/react';
import { ModalFooter } from '@heroui/react';
import { ModalHeader } from '@heroui/react';
import { StandardModal } from '../../../components/standardModal';
import { useAttractapServiceResetNfcCard } from '@attraccess/react-query-client';
import type { DeleteModalProps } from './index.contracts';

export const EnrollNfcCard = ({ children }: EnrollNfcCardProps) => {
  const { t } = useTranslations({
    de,
    en,
  });

  const [show, setShow] = useState(false);
  const [readerId, setReaderId] = useState<number | null>(null);

  const { mutate: enrollNfcCardMutation } = useAttractapServiceEnrollNfcCard();

  const close = useCallback(() => setShow(false), []);

  const enrollNfcCard = useCallback(() => {
    if (!readerId) {
      return;
    }

    enrollNfcCardMutation({ requestBody: { readerId } });
    close();
  }, [readerId, enrollNfcCardMutation, close]);

  return (
    <>
      {children(() => setShow(true))}
      <StandardDrawer
        isOpen={show}
        dialogProps={{ 'aria-label': t('enrollModal.title') }}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DrawerHeader>
          <div className="flex w-full items-start justify-between gap-3">
            <h2 className="text-lg font-semibold">{t('enrollModal.title')}</h2>
            <Button isIconOnly variant="ghost" aria-label={t('enrollModal.cancel')} onPress={close}>
              <XIcon size={16} />
            </Button>
          </div>
        </DrawerHeader>
        <DrawerBody>
          <p>{t('enrollModal.description')}</p>
          <AttractapSelect
            label={t('enrollModal.readerLabel')}
            placeholder={t('enrollModal.readerPlaceholder')}
            selection={readerId}
            onSelectionChange={(readerId) => setReaderId(readerId ?? null)}
            data-cy="enroll-nfc-card-modal-reader-select"
            requiredCapabilities={{ cardEnrollment: true }}
          />
        </DrawerBody>
        <DrawerFooter>
          <Button variant="secondary" onPress={close} data-cy="enroll-nfc-card-modal-cancel-button">
            {t('enrollModal.cancel')}
          </Button>
          <Button
            variant="primary"
            isDisabled={!readerId}
            onPress={enrollNfcCard}
            data-cy="enroll-nfc-card-modal-enroll-button"
          >
            {t('enrollModal.enroll')}
          </Button>
        </DrawerFooter>
      </StandardDrawer>
    </>
  );
};

export const NfcCardDeleteModal = (props: DeleteModalProps) => {
  const { t } = useTranslations({
    de,
    en,
  });

  const [readerId, setReaderId] = useState<number | null>(null);

  const { mutate: resetNfcCard } = useAttractapServiceResetNfcCard();

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
            <h1>{t('nfcCardsTable.deleteModal.title')}</h1>
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
            <Button isDisabled={!readerId} onPress={deleteCard} data-cy="nfc-card-delete-modal-delete-button">
              {t('nfcCardsTable.deleteModal.delete')} ID: {!readerId ? 'null' : readerId}
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
};
