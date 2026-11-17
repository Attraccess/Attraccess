import { StatusDialog, useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './de.json';
import en from './en.json';
import { useLocaleDisplayName } from './useLocaleDisplayName';

interface TranslationDeleteModalProps {
  /** The locale to remove; the dialog is open while this is set. */
  deleteTarget: string | null;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function TranslationDeleteModal({
  deleteTarget,
  isPending,
  onClose,
  onConfirm,
}: Readonly<TranslationDeleteModalProps>) {
  const { t } = useTranslations({ en, de });
  const displayName = useLocaleDisplayName();
  const language = deleteTarget ? displayName(deleteTarget) : '';
  return (
    <StatusDialog
      isOpen={!!deleteTarget}
      onClose={onClose}
      status="error"
      title={t('translations.removeLanguage', { language })}
      closeLabel={t('actions.cancel')}
      action={{
        label: t('translations.deleteConfirmButton'),
        onPress: onConfirm,
        isPending,
        'data-cy': 'translations-remove-language-confirm',
      }}
    >
      {t('translations.deleteConfirm', { language })}
    </StatusDialog>
  );
}
