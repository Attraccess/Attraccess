import { Button, Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalFooter, ModalHeader, useOverlayState } from '@heroui/react';
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

  const { t } = useTranslations({
    de,
    en,
  });

  const { open, isOpen, setOpen, close } = useOverlayState();

  const { mutate, isPending } = useAttractapServiceToggleCardActive({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: UseAttractapServiceGetAllCardsKeyFn() });
      close();
    },
  });

  const onDeactivate = useCallback(() => {
    mutate({ id: props.cardId, requestBody: { active: false } });
  }, [mutate, props.cardId]);

  return (
    <>
      {activator(() => {
        open();
      })}
      <Modal isOpen={isOpen} onOpenChange={setOpen} data-cy="nfc-card-deactivate-modal">
        <ModalBackdrop />
        <ModalContainer>
          <ModalDialog>
            {({ close }) => (
              <>
                <ModalHeader>
                  <PageHeader title={t('title')} noMargin />
                </ModalHeader>
                <ModalBody>{t('description')}</ModalBody>
                <ModalFooter>
                  <Button onPress={close}>{t('cancel')}</Button>
                  <Button onPress={onDeactivate} isPending={isPending}>
                    {t('deactivate')}
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalDialog>
        </ModalContainer>
      </Modal>
    </>
  );
}
