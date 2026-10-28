import { useTranslations, I18nTransComponent } from '@attraccess/plugins-frontend-ui';
import { StatusDialog } from '../statusDialog';
import en from './en.json';
import de from './de.json';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => unknown;
  itemName: string;
  isDeleting?: boolean;
  'data-cy'?: string;
}

export function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  itemName,
  isDeleting,
  'data-cy': dataCy,
}: Readonly<DeleteConfirmationModalProps>) {
  const { t } = useTranslations({
    en,
    de,
  });

  return (
    <StatusDialog
      isOpen={isOpen}
      onClose={onClose}
      status="error"
      title={t('title')}
      closeLabel={t('cancelButton')}
      closeDataCy="cancel-button"
      action={{ label: t('deleteButton'), onPress: onConfirm, isPending: isDeleting, 'data-cy': 'delete-button' }}
      data-cy={dataCy}
    >
      <p>
        <I18nTransComponent
          t={t}
          count={1}
          i18nKey="message"
          values={{ itemName }}
          components={{
            bold: <strong />,
            alert: <span className="block mt-2 text-danger" />,
          }}
        />
      </p>
    </StatusDialog>
  );
}
