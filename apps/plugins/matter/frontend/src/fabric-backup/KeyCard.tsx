import { Button, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Card } from '@heroui/react';
import { useMatterTranslations } from '../i18n';
import type { FabricBackupStatus } from './api';
import { Field } from './Field';

type Props = Readonly<{
  status: FabricBackupStatus;
  busy: boolean;
  generating: boolean;
  onGenerateKey: () => void;
  onRotate: () => void;
  formatDateTime: (value: string | null) => React.ReactNode;
}>;

/** The recovery key's ID and state (never the key itself), with generate or rotate. */
export function KeyCard({ status, busy, generating, onGenerateKey, onRotate, formatDateTime }: Props) {
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
            {t('fabric.key.missingText')}
          </StatusAlert>
        )}
        {recoveryKey.present && !recoveryKey.acknowledged && (
          <StatusAlert status="warning" title={t('fabric.key.unacknowledged')} data-cy="matter-key-unacknowledged">
            {t('fabric.key.unacknowledgedText')}
          </StatusAlert>
        )}
        {!recovery.required && (
          <div>
            {recoveryKey.present ? (
              <Button
                variant="secondary"
                isDisabled={busy || !initialized}
                onPress={onRotate}
                data-cy="matter-key-rotate"
              >
                {t('fabric.key.rotate')}
              </Button>
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
