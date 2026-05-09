import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useOverlayState } from '@heroui/react';
import de from './de.json';
import en from './en.json';
import {
  useBillingServiceGetSumUpReadersKey,
  useBillingServiceRemoveSumUpReader,
} from '@attraccess/react-query-client';

import { useToastMessage } from '../../../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { DeleteConfirmationModal } from '../../../../../../components/deleteConfirmationModal';
import API_ERROR_TRANSLATIONS_DE from '../../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../../global-translations/api-errors.en.json';

interface Props {
  readerId: string;
  readerName: string;
  children: (onOpen: () => void) => React.ReactNode;
}

export function SumUpReaderDeleteModal(props: Props) {
  const { readerId, readerName, children: activator } = props;

  const { t, tExists } = useTranslations({
    en: {
      ...en,
      api: API_ERROR_TRANSLATIONS_EN,
    },
    de: {
      ...de,
      api: API_ERROR_TRANSLATIONS_DE,
    },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { open, close, isOpen } = useOverlayState();
  const { mutate: removeReader, isPending: isRemovingReader } = useBillingServiceRemoveSumUpReader({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [useBillingServiceGetSumUpReadersKey] });
      close();
    },
    onError: (error: Error) => {
      toast.apiError({
        error,
        t,
        tExists,
        baseTranslationKey: 'api',
      });
    },
  });

  const onConfirm = useCallback(() => {
    removeReader({ readerId });
  }, [removeReader, readerId]);

  return (
    <>
      {activator(open)}
      <DeleteConfirmationModal
        isOpen={isOpen}
        onClose={close}
        onConfirm={onConfirm}
        isDeleting={isRemovingReader}
        itemName={readerName}
      />
    </>
  );
}
