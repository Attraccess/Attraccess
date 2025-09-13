import { useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './de.json';
import en from './en.json';
import {
  useBillingServiceGetSumUpReadersKey,
  useBillingServiceRemoveSumUpReader,
} from '@attraccess/react-query-client';
import { useDisclosure } from '@heroui/react';
import { useToastMessage } from '../../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { DeleteConfirmationModal } from '../../../../../components/deleteConfirmationModal';

interface Props {
  readerId: string;
  readerName: string;
  children: (onOpen: () => void) => React.ReactNode;
}

export function SumUpReaderDeleteModal(props: Props) {
  const { readerId, readerName, children: activator } = props;

  const { t, tExists } = useTranslations({
    de,
    en,
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { onOpen, onClose, isOpen } = useDisclosure();
  const { mutate: removeReader, isPending: isRemovingReader } = useBillingServiceRemoveSumUpReader({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [useBillingServiceGetSumUpReadersKey] });
      onClose();
    },
    onError: (error: Error) => {
      toast.apiError({
        error,
        t,
        tExists,
        baseTranslationKey: 'error.toast',
      });
    },
  });

  const onConfirm = useCallback(() => {
    removeReader({ readerId });
  }, [removeReader, readerId]);

  return (
    <>
      {activator(onOpen)}
      <DeleteConfirmationModal
        isOpen={isOpen}
        onClose={onClose}
        onConfirm={onConfirm}
        isDeleting={isRemovingReader}
        itemName={readerName}
      />
    </>
  );
}
