import { Alert } from '@heroui/react';
import { useWagoTranslations } from './i18n';
import type { ManagementPublicStatus } from '../../backend/wago-management.types';

export function ManagementSummary({
  status,
  recovery,
}: {
  status: ManagementPublicStatus | null;
  recovery: boolean | undefined;
}) {
  const { t, tBackendMessage } = useWagoTranslations();
  return (
    <>
      <p role="status">
        {t(status?.hardened ? 'security.verified' : 'security.notVerified')} ·{' '}
        {status?.state ? tBackendMessage(status.state) : t('security.inspectionRequired')} ·{' '}
        {status?.support ? tBackendMessage(status.support) : t('security.qualificationRequired')}
      </p>
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>{t('security.limitations')}</Alert.Description>
        </Alert.Content>
      </Alert>
      {status?.inspection && (
        <dl>
          <dt>{t('security.firmware')}</dt>
          <dd>
            {tBackendMessage(status.inspection.firmware)} / {tBackendMessage(status.inspection.ssh)} /{' '}
            {tBackendMessage(status.inspection.serviceControl)}
          </dd>
          {status.inspection.ssh === 'dropbear' && (
            <>
              <dt>{t('security.peerVersion')}</dt>
              <dd>{status.inspection.dropbearVersion ?? t('diagnostics.unknown')}</dd>
            </>
          )}
          <dt>{t('security.wbm')}</dt>
          <dd>{tBackendMessage(status.inspection.wbm)}</dd>
          <dt>{t('security.otherListeners')}</dt>
          <dd>{tBackendMessage(status.inspection.otherManagement)}</dd>
          <dt>{t('security.passwordAccess')}</dt>
          <dd>
            {tBackendMessage(status.inspection.passwordAccess)} / {tBackendMessage(status.inspection.defaultAccess)}
          </dd>
        </dl>
      )}
      <p>{t('security.socketHint')}</p>
      {status?.keyFingerprint && (
        <p>
          {t('security.key')} <code className="wg:break-all">{status.keyFingerprint}</code>
        </p>
      )}
      {status?.failure && (
        <p role="alert">
          {t(status.failure === 'rollback_failed' ? 'security.rollbackFailed' : 'security.transitionFailed')}
        </p>
      )}
      {recovery && <p>{t('security.recoveryDescription')}</p>}
    </>
  );
}
