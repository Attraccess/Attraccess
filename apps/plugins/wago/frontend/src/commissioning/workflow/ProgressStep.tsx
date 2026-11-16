import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import type { CommissioningSession } from '../../api/client';
import { useWagoTranslations } from '../../i18n';
import { CommissioningStatusPanel } from '../status/CommissioningStatusPanel';
import { useCommissioningVerification } from '../status/useCommissioningVerification';

export function ProgressStep({ session }: { session: CommissioningSession }) {
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
        <StatusAlert status="warning" title={t('runtimeManagement.lastSetupFailure')}>
          {tBackendMessage(session.failureReason)}
        </StatusAlert>
      )}
    </div>
  );
}
