import { useEffect, useRef, useState } from 'react';
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
import { useToastMessage } from '../../../../components/toastProvider';
import { MeterNameForm } from './MeterNameForm';
import en from './en.json';
import de from './de.json';

const ERROR_KEYS: Record<string, string> = {
  METER_IN_USE: 'errorInUse',
  METER_HAS_HISTORY: 'errorHasHistory',
  METER_NAME_EXISTS: 'errorNameExists',
};

/** The `data-cy` of a meter's ⋮ trigger, by which the card finds it to put the focus there. */
export const meterActionsId = (meterId: number) => `meter-actions-${meterId}`;

/**
 * The ⋮ menu of one meter (rename, archive or restore, delete), for users who may edit the resource. It renders into
 * the wrapping flex row of the meter's name: the menu stays beside the name, while the rename form and a refusal
 * each take a line of their own.
 */
export function MeterActions({
  resourceId,
  meter,
  onMoved,
}: {
  resourceId: number;
  meter: ResourceMeterDto;
  /** The meter leaves this list (archived, restored, deleted or gone), and with it the menu that had the focus. */
  onMoved?: (moved: { meterId: number; restored: boolean }) => void;
}) {
  const { t } = useTranslations({ en, de });
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToastMessage();
  const [errorKey, setErrorKey] = useState<string>();
  const [renaming, setRenaming] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const focusMenu = useRef(false);
  // The menu trigger only exists again once the rename form is gone.
  useEffect(() => {
    if (renaming || !focusMenu.current) return;
    focusMenu.current = false;
    wrapper.current?.querySelector<HTMLElement>(`[data-cy="${meterActionsId(meter.id)}"]`)?.focus();
  }, [renaming, meter.id]);
  // A refusal is out of date once the meter can be deleted again (the session that held it ended) or moved.
  const lastState = useRef({ deletable: meter.deletable, archivedAt: meter.archivedAt });
  useEffect(() => {
    const before = lastState.current;
    lastState.current = { deletable: meter.deletable, archivedAt: meter.archivedAt };
    if ((meter.deletable && !before.deletable) || meter.archivedAt !== before.archivedAt) setErrorKey(undefined);
  }, [meter.deletable, meter.archivedAt]);
  const archive = useArchiveResourceMeter();
  const restore = useRestoreResourceMeter();
  const remove = useDeleteResourceMeter();
  const pending = archive.isPending || restore.isPending || remove.isPending;
  const path = { resourceId, meterId: meter.id };

  // A refusal is shown here, so the confirmation dialog closes either way. The list is reloaded either way too:
  // a refusal means it was out of date.
  // `messages` overrides the text of a refusal for the action at hand.
  // `done` announces a success; the meter then leaves this list.
  const run = async (action: () => Promise<unknown>, done: string, messages: Record<string, string> = {}) => {
    setErrorKey(undefined);
    try {
      await action();
      toast.success({ title: t(done, { name: meter.name }) });
      onMoved?.({ meterId: meter.id, restored: !!meter.archivedAt });
    } catch (error) {
      const code = getApiErrorMessage(error as Error);
      if (code === 'METER_NOT_FOUND') {
        // The meter is gone and its row with it, so an inline message would vanish too.
        toast.error({ title: t('errorNotFound') });
        onMoved?.({ meterId: meter.id, restored: false });
      } else setErrorKey(messages[code] ?? ERROR_KEYS[code] ?? 'errorAction');
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: UseListResourceMetersKeyFn({ path: { resourceId } }) }),
      queryClient.invalidateQueries({ queryKey: UseGetResourceMeteringStatusKeyFn({ path: { resourceId } }) }),
    ]);
  };

  if (!hasPermission('resources.update')) return null;
  return (
    <>
      <div ref={wrapper} className={renaming ? 'w-full' : undefined}>
        {renaming ? (
          <MeterNameForm
            resourceId={resourceId}
            meter={meter}
            // A new name settles a name clash, and an older message would no longer be true.
            onSaved={() => setErrorKey(undefined)}
            onClose={(hadFocus) => {
              focusMenu.current = hadFocus;
              setRenaming(false);
            }}
          />
        ) : (
          <TableRowActions
            data-cy={meterActionsId(meter.id)}
            itemName={meter.name}
            isPending={pending}
            actions={[
              {
                key: 'rename',
                label: t('rename'),
                icon: PencilIcon,
                onPress: () => {
                  setErrorKey(undefined);
                  setRenaming(true);
                },
              },
              {
                key: 'restore',
                label: t('restore'),
                icon: ArchiveRestoreIcon,
                isHidden: !meter.archivedAt,
                onPress: () => run(() => restore.mutateAsync({ path }), 'restoredToast'),
              },
              {
                key: 'archive',
                label: t('archive'),
                icon: ArchiveIcon,
                isHidden: !!meter.archivedAt,
                confirm: { title: t('archiveTitle', { name: meter.name }), message: t('archiveMessage') },
                onPress: () => run(() => archive.mutateAsync({ path }), 'archivedToast'),
              },
              {
                key: 'delete',
                label: t('delete'),
                icon: Trash2Icon,
                tone: 'danger',
                isHidden: !meter.deletable,
                confirm: { title: t('deleteTitle', { name: meter.name }), message: t('deleteMessage') },
                onPress: () =>
                  run(() => remove.mutateAsync({ path }), 'deletedToast', { METER_IN_USE: 'errorInUseDelete' }),
              },
            ]}
          />
        )}
      </div>
      {errorKey && (
        // HeroUI's Alert is presentational: without the role, screen readers do not hear the refusal.
        <div role="alert" className="w-full">
          <StatusAlert status="danger">{t(errorKey)}</StatusAlert>
        </div>
      )}
    </>
  );
}
