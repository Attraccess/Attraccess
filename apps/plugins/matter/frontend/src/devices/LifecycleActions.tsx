import { Button, StatusDialog } from '@attraccess/plugins-frontend-ui';
import { useState } from 'react';
import { useMatterTranslations } from '../i18n';
import {
  archiveNode,
  claimNode,
  forceRemoveNode,
  relinkNode,
  repairNode,
  restoreNode,
  type MatterNodeSummary,
} from './api';
import { ClaimDialog } from './ClaimDialog';
import { ACTIONS_BY_STATE, type LifecycleAction } from './nodeLabel';
import { RelinkDialog } from './RelinkDialog';

type Dialog = LifecycleAction | { error: string } | null;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Actions that need a confirmation text of their own; claim and relink have richer dialogs. */
const CONFIRMED = {
  repair: { status: 'info', run: (id: string) => repairNode(id) },
  archive: { status: 'warning', run: (id: string) => archiveNode(id) },
  restore: { status: 'info', run: (id: string) => restoreNode(id) },
  forceRemove: { status: 'error', run: (id: string) => forceRemoveNode(id) },
} as const;

/**
 * The lifecycle buttons of one device and their confirmations (`StatusDialog`). Only the actions its state allows are
 * offered: an unclaimed device can be claimed, a detached one repaired or relinked, and both archived or force-removed.
 * Render it only for users with `matter.devices.manage`. `onChanged` runs after an action succeeded.
 */
export function LifecycleActions({
  node,
  onChanged,
  name,
}: Readonly<{ node: MatterNodeSummary; onChanged: () => void; name: string }>) {
  const { t } = useMatterTranslations();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const actions = ACTIONS_BY_STATE[node.lifecycleState];

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      setDialog(null);
      onChanged();
    } catch (error) {
      setDialog({ error: messageOf(error) });
    } finally {
      setBusy(false);
    }
  };

  if (actions.length === 0) return null;
  const confirmed = typeof dialog === 'string' && dialog in CONFIRMED ? CONFIRMED[dialog as keyof typeof CONFIRMED] : null;
  return (
    <div className="mt:flex mt:flex-wrap mt:gap-2" data-cy="matter-lifecycle-actions">
      {actions.map((action) => (
        <Button
          key={action}
          size="sm"
          variant={action === 'forceRemove' ? 'danger-soft' : action === 'claim' || action === 'repair' ? 'primary' : 'secondary'}
          onPress={() => setDialog(action)}
          data-cy={`matter-action-${action}`}
        >
          {t(`devices.actions.${action}`)}
        </Button>
      ))}

      <ClaimDialog
        isOpen={dialog === 'claim'}
        busy={busy}
        onClose={() => setDialog(null)}
        onClaim={(displayName) => void run(() => claimNode(node.id, displayName))}
      />
      <RelinkDialog
        target={node}
        isOpen={dialog === 'relink'}
        busy={busy}
        onClose={() => setDialog(null)}
        onRelink={(source, confirmMismatch) => void run(() => relinkNode(node.id, source, confirmMismatch))}
      />
      {typeof dialog === 'string' && confirmed && (
        <StatusDialog
          isOpen
          status={confirmed.status}
          title={t(`devices.confirm.${dialog}.title`, { name })}
          onClose={() => setDialog(null)}
          action={{
            label: t(`devices.actions.${dialog}`),
            isPending: busy,
            onPress: () => void run(() => confirmed.run(node.id)),
            'data-cy': 'matter-confirm-action',
          }}
          data-cy={`matter-confirm-${dialog}`}
        >
          {t(`devices.confirm.${dialog}.text`, { name })}
        </StatusDialog>
      )}
      <StatusDialog
        isOpen={dialog !== null && typeof dialog === 'object'}
        status="error"
        title={t('devices.actionFailed')}
        onClose={() => setDialog(null)}
        data-cy="matter-action-error"
      >
        {typeof dialog === 'object' && dialog ? dialog.error : ''}
      </StatusDialog>
    </div>
  );
}
