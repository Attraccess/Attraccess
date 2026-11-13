import { Button, StatusAlert, StatusDialog } from '@attraccess/plugins-frontend-ui';
import { Card } from '@heroui/react';
import { useState } from 'react';
import { useMatterTranslations } from '../i18n';
import type { FabricBackupStatus } from './api';

type Props = Readonly<{
  status: FabricBackupStatus;
  busy: boolean;
  onRestore: () => void;
  onAcceptSidecar: () => Promise<void>;
  onStartNew: () => Promise<void>;
}>;

type Confirm = 'accept' | 'start-new' | null;

/**
 * Recovery options for a plugin in `recovery_required`. Each option is admin-confirmed; none runs automatically.
 * An option the current sidecar state does not allow stays visible but disabled, with the reason.
 */
export function RecoveryPanel({ status, busy, onRestore, onAcceptSidecar, onStartNew }: Props) {
  const { t } = useMatterTranslations();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const canAccept = status.actions.canAcceptSidecar && status.sidecar.state === 'initialized';
  const canStartNew = status.actions.canStartNew && status.sidecar.state === 'uninitialized';

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } finally {
      setConfirm(null);
    }
  };

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
          text={t('fabric.recovery.restoreText')}
          action={
            <Button
              isDisabled={busy || !status.actions.canRestore}
              onPress={onRestore}
              data-cy="matter-recovery-restore"
            >
              {t('fabric.recovery.restoreAction')}
            </Button>
          }
        />
        <Option
          title={t('fabric.recovery.acceptTitle')}
          text={canAccept ? t('fabric.recovery.acceptText') : t('fabric.recovery.acceptUnavailable')}
          action={
            <Button
              variant="secondary"
              isDisabled={busy || !canAccept}
              onPress={() => setConfirm('accept')}
              data-cy="matter-recovery-accept"
            >
              {t('fabric.recovery.acceptAction')}
            </Button>
          }
        />
        <Option
          title={t('fabric.recovery.newTitle')}
          text={canStartNew ? t('fabric.recovery.newText') : t('fabric.recovery.newUnavailable')}
          action={
            <Button
              variant="danger-soft"
              isDisabled={busy || !canStartNew}
              onPress={() => setConfirm('start-new')}
              data-cy="matter-recovery-new"
            >
              {t('fabric.recovery.newAction')}
            </Button>
          }
        />
      </Card.Content>

      <StatusDialog
        isOpen={confirm === 'accept'}
        status="warning"
        title={t('fabric.recovery.acceptConfirmTitle')}
        onClose={() => setConfirm(null)}
        action={{
          label: t('fabric.recovery.acceptConfirm'),
          isPending: busy,
          onPress: () => run(onAcceptSidecar),
          'data-cy': 'matter-recovery-accept-confirm',
        }}
        data-cy="matter-recovery-accept-dialog"
      >
        {t('fabric.recovery.acceptConfirmText')}
      </StatusDialog>
      <StatusDialog
        isOpen={confirm === 'start-new'}
        status="error"
        title={t('fabric.recovery.newConfirmTitle')}
        onClose={() => setConfirm(null)}
        action={{
          label: t('fabric.recovery.newConfirm'),
          isPending: busy,
          onPress: () => run(onStartNew),
          'data-cy': 'matter-recovery-new-confirm',
        }}
        data-cy="matter-recovery-new-dialog"
      >
        {t('fabric.recovery.newConfirmText')}
      </StatusDialog>
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
