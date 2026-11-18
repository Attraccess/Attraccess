import { DrawerBody, DrawerFooter, DrawerHeader, DrawerHeading, useOverlayState } from '@heroui/react';
import de from './de.json';
import en from './en.json';
import { Button, StandardDrawer, useTranslations } from '@attraccess/plugins-frontend-ui';
import { UseGetAllCardsKeyFn, useToggleCardActive } from '@attraccess/react-query-client';
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

  const { mutate, isPending } = useToggleCardActive(undefined, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: UseGetAllCardsKeyFn({}, []) });
      close();
    },
  });

  const onActivate = useCallback(() => {
    mutate({ path: { id: props.cardId }, body: { active: true } });
  }, [mutate, props.cardId]);

  return (
    <>
      {activator(() => {
        open();
      })}
      <StandardDrawer isOpen={isOpen} onOpenChange={setOpen} dialogProps={{ 'aria-label': t('title') }}>
        <div data-cy="nfc-card-activate-modal" className="contents">
          <DrawerHeader>
            <DrawerHeading className="text-lg font-semibold">{t('title')}</DrawerHeading>
          </DrawerHeader>
          <DrawerBody>{t('description')}</DrawerBody>
          <DrawerFooter>
            <Button variant="secondary" onPress={close}>
              {t('cancel')}
            </Button>
            <Button variant="primary" onPress={onActivate} isPending={isPending}>
              {t('activate')}
            </Button>
          </DrawerFooter>
        </div>
      </StandardDrawer>
    </>
  );
}
