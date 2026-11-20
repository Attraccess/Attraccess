import { Button, ConfirmableButton, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Card } from '@heroui/react';
import { useMatterTranslations } from '../i18n';
import type { FabricBackupStatus } from './api';
import { Field } from './Field';

type Props = Readonly<{
  status: FabricBackupStatus;
  busy: boolean;
  generating: boolean;
  rotating: boolean;
  onGenerateKey: () => void;
  /** Runs after the administrator confirmed the rotation. */
  onRotate: () => Promise<void>;
  /** Holds `matter.devices.manage`: without it generate and rotate are hidden. */
  canManage: boolean;
  formatDateTime: (value: string | null) => React.ReactNode;
}>;

/** The recovery key's ID and state (never the key itself), with generate or rotate. */
export function KeyCard({
  status,
  busy,
  generating,
  rotating,
  onGenerateKey,
  onRotate,
  canManage,
  formatDateTime,
}: Props) {
  const { t } = useMatterTranslations();
  const { sidecar, recovery, recoveryKey } = status;
  const initialized = sidecar.reachable && sidecar.state === 'initialized';
  if (!initialized && !recoveryKey.present) return null;
  return (
    <Card data-cy="matter-key-card">
      <Card.Header>
        <Card.Title>{t('fabric.key.cardTitle')}</Card.Title>
      </Card.Header>
      <Card.Content className="mt:flex mt:flex-col mt:gap-3">
        {recoveryKey.present ? (
          <dl className="mt:grid mt:grid-cols-1 mt:gap-3 mt:sm:grid-cols-2">
            <Field label={t('fabric.key.keyId')}>{recoveryKey.keyId}</Field>
            <Field label={t('fabric.key.created')}>{formatDateTime(recoveryKey.createdAt)}</Field>
          </dl>
        ) : (
          <StatusAlert status="warning" title={t('fabric.key.missing')} data-cy="matter-key-missing">
            {t(canManage ? 'fabric.key.missingText' : 'fabric.key.missingTextReadOnly')}
          </StatusAlert>
        )}
        {recoveryKey.present && !recoveryKey.acknowledged && (
          <StatusAlert status="warning" title={t('fabric.key.unacknowledged')} data-cy="matter-key-unacknowledged">
            {t(canManage ? 'fabric.key.unacknowledgedText' : 'fabric.key.unacknowledgedTextReadOnly')}
          </StatusAlert>
        )}
        {canManage && !recovery.required && (
          <div>
            {recoveryKey.present ? (
              <ConfirmableButton
                label={t('fabric.key.rotate')}
                status="warning"
                isDisabled={busy || !initialized}
                isPending={rotating}
                onConfirm={onRotate}
                confirm={{
                  title: t('fabric.key.rotateTitle'),
                  message: t('fabric.key.rotateText'),
                  confirmLabel: t('fabric.key.rotateConfirm'),
                  'data-cy': 'matter-rotate-dialog',
                  confirmDataCy: 'matter-rotate-confirm',
                }}
                data-cy="matter-key-rotate"
              />
            ) : (
              <Button
                isDisabled={busy || !initialized}
                isPending={generating}
                onPress={onGenerateKey}
                data-cy="matter-key-generate"
              >
                {t('fabric.key.generate')}
              </Button>
            )}
          </div>
        )}
      </Card.Content>
    </Card>
  );
}
