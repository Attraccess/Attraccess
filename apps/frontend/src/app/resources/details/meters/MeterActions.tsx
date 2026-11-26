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
};

/** Rename, archive or restore, and delete one meter, for users who may edit the resource. */
export function MeterActions({ resourceId, meter }: { resourceId: number; meter: ResourceMeterDto }) {
  const { t } = useTranslations({ en, de });
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [errorKey, setErrorKey] = useState<string>();
  const archive = useArchiveResourceMeter();
  const restore = useRestoreResourceMeter();
  const remove = useDeleteResourceMeter();
  const pending = archive.isPending || restore.isPending || remove.isPending;
  const path = { resourceId, meterId: meter.id };

  // A refusal is shown here, so the confirmation dialog closes either way. The list is reloaded either way too:
  // a refusal means it was out of date.
  const run = async (action: () => Promise<unknown>) => {
    setErrorKey(undefined);
    try {
      await action();
    } catch (error) {
      setErrorKey(ERROR_KEYS[getApiErrorMessage(error as Error)] ?? 'errorAction');
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
        {meter.archivedAt && (
          <Button
            size="sm"
            variant="secondary"
            isDisabled={pending}
            isPending={restore.isPending}
            onPress={() => void run(() => restore.mutateAsync({ path }))}
          >
            {t('restore')}
          </Button>
        )}
        <MeterNameEditor resourceId={resourceId} meter={meter} />
        {!meter.archivedAt && (
          <ConfirmableButton
            label={t('archive')}
            status="warning"
            buttonProps={{ size: 'sm' }}
            isDisabled={pending}
            confirm={{ title: t('archiveTitle', { name: meter.name }), message: t('archiveMessage') }}
            onConfirm={() => run(() => archive.mutateAsync({ path }))}
          />
        )}
        {meter.deletable && (
          <ConfirmableButton
            label={t('delete')}
            status="error"
            buttonProps={{ size: 'sm' }}
            isDisabled={pending}
            confirm={{ title: t('deleteTitle', { name: meter.name }), message: t('deleteMessage') }}
            onConfirm={() => run(() => remove.mutateAsync({ path }))}
          />
        )}
      </div>
      {errorKey && <StatusAlert status="danger">{t(errorKey)}</StatusAlert>}
    </div>
  );
}
