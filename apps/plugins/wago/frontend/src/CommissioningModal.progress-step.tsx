import { Alert } from '@heroui/react';
import { CommissioningSession } from './api';
import { useCommissioningVerification } from './useCommissioningVerification';
import { useWagoTranslations } from './i18n';
import { CommissioningStatusPanel } from './CommissioningModal.commissioning-status-panel';

export function ProgressStep({ session }: { name: string; session: CommissioningSession }) {
  const { t, tBackendMessage } = useWagoTranslations();
  const verification = useCommissioningVerification(session);
  const complete =
    verification.enrollmentComplete ||
    ['completed', 'revoked', 'claim_interrupted', 'recovery_revocation_pending'].includes(session.state);
  const progress = verification.enrollmentComplete
    ? {
        ...session,
        progressStep: t('commissioningUI.enrollmentComplete'),
        progressDetail: verification.runtimeVerified
          ? t('commissioningUI.verifiedDescription')
          : t('commissioningUI.setupPendingDescription'),
      }
    : session;
  return (
    <div className="wg:space-y-4">
      <CommissioningStatusPanel isActive={!complete} session={progress} />
      <div className="wg:rounded-large wg:border wg:border-default-200 wg:p-4 wg:text-sm">
        <p className="wg:font-medium">{t('commissioningUI.safeToClose')}</p>
        <p className="wg:mt-1 wg:text-muted">{t('commissioningUI.savedDescription')}</p>
      </div>
      {session.failureReason && (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t('runtimeManagement.lastSetupFailure')}</Alert.Title>
            <Alert.Description>{tBackendMessage(session.failureReason)}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </div>
  );
}
