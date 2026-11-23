import { CheckIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { TableRowActions, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  NfcCard,
  UseGetAllCardsKeyFn,
  useDeleteUidOnlyCard,
  useToggleCardActive,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../global-translations/api-errors.en.json';
import de from './de.json';
import en from './en.json';

interface NfcCardRowActionsProps {
  card: NfcCard;
  onDeleteClick: () => void;
}

export function NfcCardRowActions({ card, onDeleteClick }: Readonly<NfcCardRowActionsProps>) {
  const { t, tExists } = useTranslations({
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
  });
  const queryClient = useQueryClient();
  const toast = useToastMessage();
  const { mutateAsync: toggleActive } = useToggleCardActive(undefined, {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: UseGetAllCardsKeyFn({}, []) }),
    onError: (error) => toast.error({ title: t('nfcCardsTable.toggleError'), description: (error as Error).message }),
  });

  // Nothing is written to a UID-only card, so it is deleted right away, without a reader.
  const { mutateAsync: deleteUidOnly } = useDeleteUidOnlyCard(undefined, {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: UseGetAllCardsKeyFn({}, []) }),
    onError: (error) => toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' }),
  });
  const isUidOnly = card.type === 'uid-only';

  return (
    <TableRowActions
      itemName={card.uid}
      actions={[
        {
          key: 'deactivate',
          label: t('nfcCardsTable.actions.deactivate'),
          icon: XIcon,
          isHidden: !card.isActive,
          onPress: () => toggleActive({ path: { id: card.id }, body: { active: false } }),
          confirm: {
            title: t('nfcCardsTable.deactivateModal.title'),
            message: t('nfcCardsTable.deactivateModal.description'),
            'data-cy': 'nfc-card-deactivate-modal',
          },
          'data-cy': `nfc-card-table-cell-deactivate-button-${card.id}`,
        },
        {
          key: 'activate',
          label: t('nfcCardsTable.actions.activate'),
          icon: CheckIcon,
          isHidden: card.isActive,
          onPress: () => toggleActive({ path: { id: card.id }, body: { active: true } }),
          confirm: {
            title: t('nfcCardsTable.activateModal.title'),
            message: t('nfcCardsTable.activateModal.description'),
            'data-cy': 'nfc-card-activate-modal',
          },
          'data-cy': `nfc-card-table-cell-activate-button-${card.id}`,
        },
        {
          key: 'delete',
          label: t('nfcCardsTable.actions.delete'),
          icon: Trash2Icon,
          tone: 'danger',
          onPress: isUidOnly ? () => deleteUidOnly({ path: { id: card.id } }) : onDeleteClick,
          ...(isUidOnly
            ? {
                confirm: {
                  title: t('nfcCardsTable.deleteUidOnlyModal.title'),
                  message: t('nfcCardsTable.deleteUidOnlyModal.description', { id: card.id }),
                  'data-cy': 'nfc-card-delete-uid-only-modal',
                },
              }
            : {}),
          'data-cy': `nfc-card-table-cell-delete-button-${card.id}`,
        },
      ]}
    />
  );
}
