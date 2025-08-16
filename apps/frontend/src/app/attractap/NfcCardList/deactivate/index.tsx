import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, useDisclosure } from '@heroui/react';
import de from './de.json';
import en from './en.json';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../../../components/pageHeader';
import {
  UseAttractapServiceGetAllCardsKeyFn,
  useAttractapServiceToggleCardActive,
} from '@attraccess/react-query-client';
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  children: (onOpen: () => void) => React.ReactNode;
  cardId: number;
}

export function NfcCardDeactivateModal(props: Props) {
  const { children: activator } = props;

  const queryClient = useQueryClient();

  const { t } = useTranslations('attractap-deactivate-card-modal', {
    de,
    en,
  });

  const { onOpen, isOpen, onOpenChange, onClose } = useDisclosure();

  const { mutate, isPending } = useAttractapServiceToggleCardActive({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: UseAttractapServiceGetAllCardsKeyFn() });
      onClose();
    },
  });

  const onDeactivate = useCallback(() => {
    mutate({ id: props.cardId, requestBody: { active: false } });
  }, [mutate, props.cardId]);

  return (
    <>
      {activator(() => {
        onOpen();
      })}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange} scrollBehavior="inside" data-cy="nfc-card-deactivate-modal">
        <ModalContent>
          <ModalHeader>
            <PageHeader title={t('title')} noMargin />
          </ModalHeader>
          <ModalBody>{t('description')}</ModalBody>
          <ModalFooter>
            <Button onPress={onClose}>{t('cancel')}</Button>
            <Button onPress={onDeactivate} isLoading={isPending}>
              {t('deactivate')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
