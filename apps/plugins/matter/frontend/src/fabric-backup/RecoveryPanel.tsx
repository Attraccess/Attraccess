import { Button, ConfirmableButton, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Card } from '@heroui/react';
import { useMatterTranslations } from '../i18n';
import type { FabricBackupStatus } from './api';
import { restoreBlocker } from './blockers';

type Props = Readonly<{
  status: FabricBackupStatus;
  /** The action that is running (its button spins), or null. */
  pending: string | null;
  onRestore: () => void;
  onAcceptSidecar: () => Promise<void>;
  onStartNew: () => Promise<void>;
}>;

/**
 * Recovery options for a plugin in `recovery_required`. Each option is admin-confirmed; none runs automatically.
 * An option the current sidecar state does not allow stays visible but disabled, with the reason.
 */
export function RecoveryPanel({ status, pending, onRestore, onAcceptSidecar, onStartNew }: Props) {
  const { t } = useMatterTranslations();
  const canAccept = status.actions.canAcceptSidecar && status.sidecar.state === 'initialized';
  const canStartNew = status.actions.canStartNew && status.sidecar.state === 'uninitialized';
  const restoreBlocked = restoreBlocker(status);
  const busy = pending !== null;

  return (
    <Card data-cy="matter-recovery-panel">
      <Card.Header>
        <Card.Title>{t('fabric.recovery.title')}</Card.Title>
      </Card.Header>
      <Card.Content className="mt:flex mt:flex-col mt:gap-4">
        <StatusAlert status="danger" title={t('fabric.recovery.blocked')}>
          {t('fabric.recovery.blockedText')}
        </StatusAlert>
        <Option
          title={t('fabric.recovery.restoreTitle')}
          text={restoreBlocked ? t(`fabric.blocked.${restoreBlocked}`) : t('fabric.recovery.restoreText')}
          action={
            <Button isDisabled={busy || restoreBlocked !== null} onPress={onRestore} data-cy="matter-recovery-restore">
              {t('fabric.recovery.restoreAction')}
            </Button>
          }
        />
        <Option
          title={t('fabric.recovery.acceptTitle')}
          text={canAccept ? t('fabric.recovery.acceptText') : t('fabric.recovery.acceptUnavailable')}
          action={
            <ConfirmableButton
              label={t('fabric.recovery.acceptAction')}
              status="warning"
              isDisabled={busy || !canAccept}
              isPending={pending === 'accept'}
              onConfirm={onAcceptSidecar}
              confirm={{
                title: t('fabric.recovery.acceptConfirmTitle'),
                message: t('fabric.recovery.acceptConfirmText'),
                confirmLabel: t('fabric.recovery.acceptConfirm'),
                'data-cy': 'matter-recovery-accept-dialog',
                confirmDataCy: 'matter-recovery-accept-confirm',
              }}
              data-cy="matter-recovery-accept"
            />
          }
        />
        <Option
          title={t('fabric.recovery.newTitle')}
          text={canStartNew ? t('fabric.recovery.newText') : t('fabric.recovery.newUnavailable')}
          action={
            <ConfirmableButton
              label={t('fabric.recovery.newAction')}
              status="error"
              buttonProps={{ variant: 'danger-soft' }}
              isDisabled={busy || !canStartNew}
              isPending={pending === 'startNew'}
              onConfirm={onStartNew}
              confirm={{
                title: t('fabric.recovery.newConfirmTitle'),
                message: t('fabric.recovery.newConfirmText'),
                confirmLabel: t('fabric.recovery.newConfirm'),
                'data-cy': 'matter-recovery-new-dialog',
                confirmDataCy: 'matter-recovery-new-confirm',
              }}
              data-cy="matter-recovery-new"
            />
          }
        />
      </Card.Content>
    </Card>
  );
}

function Option({ title, text, action }: Readonly<{ title: string; text: string; action: React.ReactNode }>) {
  return (
    <div className="mt:flex mt:flex-col mt:gap-2 mt:sm:flex-row mt:sm:items-center mt:sm:justify-between">
      <div>
        <p className="mt:font-medium">{title}</p>
        <p className="mt:text-sm mt:text-muted">{text}</p>
      </div>
      <div className="mt:shrink-0">{action}</div>
    </div>
  );
}
