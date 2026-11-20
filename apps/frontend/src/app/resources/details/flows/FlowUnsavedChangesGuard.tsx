import { useCallback, useEffect } from 'react';
import { useBlocker, type BlockerFunction } from 'react-router-dom';
import { StatusDialog, useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './de.json';
import en from './en.json';

/** Asks the browser to confirm reload, tab close and external navigation while `isDirty`. */
function useBeforeUnloadWhileDirty(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [isDirty]);
}

/**
 * Keeps unsaved flow edits from being lost: in-app navigation to another page asks in a dialog, reload and
 * close get the browser's own prompt. Search or hash changes on the editor page (e.g. `?node=`) pass.
 */
export function FlowUnsavedChangesGuard({ isDirty }: Readonly<{ isDirty: boolean }>) {
  const { t } = useTranslations({ en, de });
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname,
    [isDirty],
  );
  const blocker = useBlocker(shouldBlock);
  useBeforeUnloadWhileDirty(isDirty);

  return (
    <StatusDialog
      isOpen={blocker.state === 'blocked'}
      onClose={() => blocker.reset?.()}
      status="warning"
      title={t('unsavedChanges.title')}
      action={{
        label: t('unsavedChanges.leave'),
        onPress: () => blocker.proceed?.(),
        'data-cy': 'flow-unsaved-changes-leave',
      }}
      closeLabel={t('unsavedChanges.stay')}
      closeDataCy="flow-unsaved-changes-stay"
      data-cy="flow-unsaved-changes-dialog"
    >
      {t('unsavedChanges.description')}
    </StatusDialog>
  );
}
