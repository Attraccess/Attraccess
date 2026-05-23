import { Button, DrawerBody, DrawerFooter, DrawerHeader, useOverlayState } from '@heroui/react';
import { StandardDrawer } from '../../../../components/standardDrawer';
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
      <StandardDrawer isOpen={isOpen} onOpenChange={setOpen}>
        <div data-cy="nfc-card-deactivate-modal" className="contents">
          <DrawerHeader>
            <h2 className="text-lg font-semibold">{t('title')}</h2>
          </DrawerHeader>
          <DrawerBody>{t('description')}</DrawerBody>
          <DrawerFooter>
            <Button variant="secondary" onPress={close}>
              {t('cancel')}
            </Button>
            <Button variant="primary" onPress={onDeactivate} isPending={isPending}>
              {t('deactivate')}
            </Button>
          </DrawerFooter>
        </div>
      </StandardDrawer>
    </>
  );
}
