import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useDisclosure } from '@heroui/react';
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

  const { t } = useTranslations('attractap-delete-modal', {
    de,
    en,
  });

  const { onOpen, onClose, isOpen } = useDisclosure();

  const { mutate, isPending } = useAttractapServiceDeleteReader({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: UseAttractapServiceGetReadersKeyFn() });
      onClose();
    },
  });

  const onConfirm = useCallback(() => {
    mutate({ readerId });
  }, [mutate, readerId]);

  return (
    <>
      {activator(onOpen)}
      <DeleteConfirmationModal
        isOpen={isOpen}
        onClose={onClose}
        onConfirm={onConfirm}
        itemName={t('itemName')}
        isDeleting={isPending}
      />
    </>
  );
}
