import { useState } from 'react';
import { ArchiveIcon, ArchiveRestoreIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ResourceMeterDto,
  useArchiveResourceMeter,
  useDeleteResourceMeter,
  useRestoreResourceMeter,
  UseGetResourceMeteringStatusKeyFn,
  UseListResourceMetersKeyFn,
} from '@attraccess/react-query-client';
import { StatusAlert, TableRowActions, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../../../hooks/useAuth';
import { getApiErrorMessage } from '../../../../utils/apiError';
import { MeterNameForm } from './MeterNameForm';
import en from './en.json';
import de from './de.json';

const ERROR_KEYS: Record<string, string> = {
  METER_IN_USE: 'errorInUse',
  METER_HAS_HISTORY: 'errorHasHistory',
  METER_NAME_EXISTS: 'errorNameExists',
  METER_NOT_FOUND: 'errorNotFound',
};

/** The ⋮ menu of one meter (rename, archive or restore, delete), for users who may edit the resource. */
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
      {renaming ? (
        <MeterNameForm
          resourceId={resourceId}
          meter={meter}
          // A new name settles a name clash, and an older message would no longer be true.
          onSaved={() => setErrorKey(undefined)}
          onClose={() => setRenaming(false)}
        />
      ) : (
        <TableRowActions
          itemName={meter.name}
          isPending={pending}
          actions={[
            { key: 'rename', label: t('rename'), icon: PencilIcon, onPress: () => setRenaming(true) },
            {
              key: 'restore',
              label: t('restore'),
              icon: ArchiveRestoreIcon,
              isHidden: !meter.archivedAt,
              onPress: () => run(() => restore.mutateAsync({ path })),
            },
            {
              key: 'archive',
              label: t('archive'),
              icon: ArchiveIcon,
              isHidden: !!meter.archivedAt,
              confirm: { title: t('archiveTitle', { name: meter.name }), message: t('archiveMessage') },
              onPress: () => run(() => archive.mutateAsync({ path })),
            },
            {
              key: 'delete',
              label: t('delete'),
              icon: Trash2Icon,
              tone: 'danger',
              isHidden: !meter.deletable,
              confirm: { title: t('deleteTitle', { name: meter.name }), message: t('deleteMessage') },
              onPress: () => run(() => remove.mutateAsync({ path }), { METER_IN_USE: 'errorInUseDelete' }),
            },
          ]}
        />
      )}
      {errorKey && (
        // HeroUI's Alert is presentational: without the role, screen readers do not hear the refusal.
        <div role="alert">
          <StatusAlert status="danger">{t(errorKey)}</StatusAlert>
        </div>
      )}
    </div>
  );
}
