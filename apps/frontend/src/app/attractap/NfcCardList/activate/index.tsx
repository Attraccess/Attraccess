import {
  Button,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  useOverlayState,
} from '@heroui/react';
import de from './de.json';
import en from './en.json';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
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

export function NfcCardActivateModal(props: Props) {
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

  const onActivate = useCallback(() => {
    mutate({ id: props.cardId, requestBody: { active: true } });
  }, [mutate, props.cardId]);

  return (
    <>
      {activator(() => {
        open();
      })}
      <Modal isOpen={isOpen} onOpenChange={setOpen} data-cy="nfc-card-activate-modal">
        <ModalBackdrop>
          <ModalContainer size="sm">
            <ModalDialog>
              {({ close }) => (
                <>
                  <ModalHeader>
                    <ModalHeading>{t('title')}</ModalHeading>
                  </ModalHeader>
                  <ModalBody>{t('description')}</ModalBody>
                  <ModalFooter>
                    <Button onPress={close}>{t('cancel')}</Button>
                    <Button onPress={onActivate} isPending={isPending}>
                      {t('activate')}
                    </Button>
                  </ModalFooter>
                </>
              )}
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    </>
  );
}
