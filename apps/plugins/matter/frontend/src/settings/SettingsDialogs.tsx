import { StatusDialog } from '@attraccess/plugins-frontend-ui';
import { useMatterTranslations } from '../i18n';

/** An error remembers which action failed, so closing it returns the focus to that action's button. */
export type SettingsNotice =
  { kind: 'saved' } | { kind: 'error'; title: string; message: string; returnTo: 'save' | 'remove' } | null;

/** The result and confirmation dialogs of the settings form. */
export function SettingsDialogs({
  notice,
  onCloseSaved,
  onCloseError,
}: Readonly<{
  notice: SettingsNotice;
  /** Closing the success dialog; the form returns the focus to Save. */
  onCloseSaved: () => void;
  /** Closing the error dialog; the form returns the focus to the button of the action that failed. */
  onCloseError: () => void;
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
        onClose={onCloseError}
        data-cy="matter-error-dialog"
      >
        {notice?.kind === 'error' ? notice.message : ''}
      </StatusDialog>
    </>
  );
}
