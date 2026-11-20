import { StatusDialog } from '@attraccess/plugins-frontend-ui';
import { useMatterTranslations } from '../i18n';

export type SettingsNotice =
  { kind: 'saved' } | { kind: 'error'; title: string; message: string } | { kind: 'remove' } | null;

/** The result and confirmation dialogs of the settings form. */
export function SettingsDialogs({
  notice,
  busy,
  onCloseSaved,
  onCloseRemove,
  onConfirmRemove,
}: Readonly<{
  notice: SettingsNotice;
  busy: boolean;
  /** Closing the success and error dialogs; the form returns the focus to Save. */
  onCloseSaved: () => void;
  onCloseRemove: () => void;
  onConfirmRemove: () => Promise<void>;
}>) {
  const { t } = useMatterTranslations();
  return (
    <>
      <StatusDialog
        isOpen={notice?.kind === 'saved'}
        status="success"
        title={t('form.saved')}
        onClose={onCloseSaved}
        data-cy="matter-saved-dialog"
      >
        {t('form.savedText')}
      </StatusDialog>
      <StatusDialog
        isOpen={notice?.kind === 'error'}
        status="error"
        title={notice?.kind === 'error' ? notice.title : ''}
        onClose={onCloseSaved}
        data-cy="matter-error-dialog"
      >
        {notice?.kind === 'error' ? notice.message : ''}
      </StatusDialog>
      <StatusDialog
        isOpen={notice?.kind === 'remove'}
        status="warning"
        title={t('form.removeTitle')}
        onClose={onCloseRemove}
        action={{ label: t('form.removeConfirm'), isPending: busy, onPress: onConfirmRemove }}
        data-cy="matter-remove-dialog"
      >
        {t('form.removeText')}
      </StatusDialog>
    </>
  );
}
