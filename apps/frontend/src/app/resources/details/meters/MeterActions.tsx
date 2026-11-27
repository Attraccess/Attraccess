import { useState } from 'react';
import { Button } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ResourceMeterDto,
  useArchiveResourceMeter,
  useDeleteResourceMeter,
  useRestoreResourceMeter,
  UseGetResourceMeteringStatusKeyFn,
  UseListResourceMetersKeyFn,
} from '@attraccess/react-query-client';
import { ConfirmableButton, StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../../../hooks/useAuth';
import { getApiErrorMessage } from '../../../../utils/apiError';
import { MeterNameEditor } from './MeterNameEditor';
import en from './en.json';
import de from './de.json';

const ERROR_KEYS: Record<string, string> = {
  METER_IN_USE: 'errorInUse',
  METER_HAS_HISTORY: 'errorHasHistory',
  METER_NAME_EXISTS: 'errorNameExists',
  METER_NOT_FOUND: 'errorNotFound',
};

/** Rename, archive or restore, and delete one meter, for users who may edit the resource. */
export function MeterActions({ resourceId, meter }: { resourceId: number; meter: ResourceMeterDto }) {
  const { t } = useTranslations({ en, de });
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [errorKey, setErrorKey] = useState<string>();
  const [renaming, setRenaming] = useState(false);
  const archive = useArchiveResourceMeter();
  const restore = useRestoreResourceMeter();
  const remove = useDeleteResourceMeter();
  const pending = archive.isPending || restore.isPending || remove.isPending;
  const path = { resourceId, meterId: meter.id };

  // A refusal is shown here, so the confirmation dialog closes either way. The list is reloaded either way too:
  // a refusal means it was out of date.
  // `messages` overrides the text of a refusal for the action at hand.
  const run = async (action: () => Promise<unknown>, messages: Record<string, string> = {}) => {
    setErrorKey(undefined);
    try {
      await action();
    } catch (error) {
      const code = getApiErrorMessage(error as Error);
      setErrorKey(messages[code] ?? ERROR_KEYS[code] ?? 'errorAction');
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: UseListResourceMetersKeyFn({ path: { resourceId } }) }),
      queryClient.invalidateQueries({ queryKey: UseGetResourceMeteringStatusKeyFn({ path: { resourceId } }) }),
    ]);
  };

  if (!hasPermission('resources.update')) return null;
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-start justify-end gap-2">
        {/* A new name settles a name clash, and an older message would no longer be true. */}
        <MeterNameEditor
          resourceId={resourceId}
          meter={meter}
          isDisabled={pending}
          onSaved={() => setErrorKey(undefined)}
          onEditingChange={setRenaming}
        />
        {!renaming && meter.archivedAt && (
          <Button
            size="sm"
            variant="secondary"
            aria-label={t('restoreLabel', { name: meter.name })}
            isDisabled={pending}
            isPending={restore.isPending}
            onPress={() => void run(() => restore.mutateAsync({ path }))}
          >
            {t('restore')}
          </Button>
        )}
        {!renaming && !meter.archivedAt && (
          <ConfirmableButton
            label={t('archive')}
            status="warning"
            buttonProps={{ size: 'sm', 'aria-label': t('archiveLabel', { name: meter.name }) }}
            isDisabled={pending}
            confirm={{ title: t('archiveTitle', { name: meter.name }), message: t('archiveMessage') }}
            onConfirm={() => run(() => archive.mutateAsync({ path }))}
          />
        )}
        {!renaming && meter.deletable && (
          <ConfirmableButton
            label={t('delete')}
            status="error"
            buttonProps={{ size: 'sm', 'aria-label': t('deleteLabel', { name: meter.name }) }}
            isDisabled={pending}
            confirm={{ title: t('deleteTitle', { name: meter.name }), message: t('deleteMessage') }}
            onConfirm={() => run(() => remove.mutateAsync({ path }), { METER_IN_USE: 'errorInUseDelete' })}
          />
        )}
      </div>
      {errorKey && (
        // HeroUI's Alert is presentational: without the role, screen readers do not hear the refusal.
        <div role="alert">
          <StatusAlert status="danger">{t(errorKey)}</StatusAlert>
        </div>
      )}
    </div>
  );
}
