import { StatusAlert, StatusDialog, type TranslationMessage } from '@attraccess/plugins-frontend-ui';
import { useState } from 'react';
import { useRabbitmqTranslations } from '../i18n';
import { errorTitle } from './errorTitle';
import { deleteUser, type RabbitmqUser } from './users-api';

interface RabbitmqUserDeleteDialogProps {
  mqttServerId: number;
  // The user pending deletion; null keeps the dialog closed.
  user: RabbitmqUser | null;
  onClose: () => void;
  // Called after a successful delete so the panel can reload the list.
  onDeleted: () => void;
}

export function RabbitmqUserDeleteDialog({ mqttServerId, user, onClose, onDeleted }: RabbitmqUserDeleteDialogProps) {
  const { t, tMessage } = useRabbitmqTranslations();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | TranslationMessage | null>(null);
  const [confirmingName, setConfirmingName] = useState<string | null>(null);

  // A fresh confirmation never shows the previous attempt's error, not even for one render.
  const userName = user?.name ?? null;
  if (userName !== confirmingName) {
    setConfirmingName(userName);
    if (userName !== null) {
      setDeleteError(null);
    }
  }

  const confirmDelete = async () => {
    if (!user) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteUser(mqttServerId, user.name);
      onClose();
      onDeleted();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : { key: 'users.deleteError' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <StatusDialog
      isOpen={user !== null}
      onClose={onClose}
      status="error"
      title={t('users.deleteTitle')}
      action={{
        label: t('common.delete'),
        onPress: confirmDelete,
        isPending: deleting,
        'data-cy': 'rabbitmq-user-delete-confirm-button',
      }}
      closeLabel={t('common.cancel')}
      closeDataCy="rabbitmq-user-delete-cancel-button"
      data-cy={`rabbitmq-user-delete-modal-${mqttServerId}`}
    >
      <div className="rmq:flex rmq:flex-col rmq:gap-3">
        <p>{t('users.deleteDescription', { name: user?.name })}</p>
        {deleteError && (
          <StatusAlert
            status="danger"
            title={errorTitle(deleteError, t('users.deleteError'))}
            data-cy="rabbitmq-user-delete-error-alert"
          >
            {tMessage(deleteError)}
          </StatusAlert>
        )}
      </div>
    </StatusDialog>
  );
}
