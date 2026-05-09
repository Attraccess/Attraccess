import { useTranslations } from '@attraccess/plugins-frontend-ui';

import { useOverlayState } from '@heroui/react';
import de from './de.json';
import en from './en.json';
import { DeleteConfirmationModal } from '../../../../components/deleteConfirmationModal';
import { useAttractapServiceDeleteReader, UseAttractapServiceGetReadersKeyFn } from '@attraccess/react-query-client';
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  readerId: number;
  children: (onOpen: () => void) => React.ReactNode;
}

export function AttractapDeleteModal(props: Props) {
  const { readerId, children: activator } = props;

  const queryClient = useQueryClient();

  const { t } = useTranslations({
    de,
    en,
  });

  const { open, close, isOpen } = useOverlayState();

  const { mutate, isPending } = useAttractapServiceDeleteReader({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: UseAttractapServiceGetReadersKeyFn() });
      close();
    },
  });

  const onConfirm = useCallback(() => {
    mutate({ readerId });
  }, [mutate, readerId]);

  return (
    <>
      {activator(open)}
      <DeleteConfirmationModal
        isOpen={isOpen}
        onClose={close}
        onConfirm={onConfirm}
        itemName={t('itemName')}
        isDeleting={isPending}
      />
    </>
  );
}
