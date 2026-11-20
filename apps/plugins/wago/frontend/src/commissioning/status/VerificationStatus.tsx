import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Button } from '@heroui/react';
import type { CommissioningSession } from '../../api/client';
import { useWagoTranslations } from '../../i18n';
import { CommissioningSecurityPanel } from './SecurityPanel';
import { useCommissioningVerification } from './useCommissioningVerification';

export function VerificationStatus({
  session,
  onConfigure,
}: {
  session: CommissioningSession;
  onConfigure?: (controllerId: number) => void;
}) {
  const { t, tBackendMessage } = useWagoTranslations();
  const verification = useCommissioningVerification(session);
  const controllerId = verification.data?.controllerId;
  const managementControllerId = controllerId ?? session.managementControllerId;
  return (
    <div className="wg:space-y-3">
      <StatusAlert
        status={verification.enrollmentComplete ? 'success' : 'warning'}
        title={t(verification.enrollmentComplete ? 'commissioningUI.enrolled' : 'commissioningUI.verifying')}
      >
        {verification.unavailable ? (
          t('commissioningUI.verificationUnavailable')
        ) : verification.data ? (
          <ul>
            <li>
              {t('commissioningUI.heartbeat', {
                status: t(
                  verification.data.permanentConnection ? 'commissioningUI.received' : 'commissioningUI.pending',
                ),
              })}
            </li>
            <li>
              {t('commissioningUI.credentialRevoked', {
                status: t(verification.data.enrollmentRevoked ? 'commissioningUI.verified' : 'commissioningUI.pending'),
              })}
            </li>
          </ul>
        ) : (
          t('commissioningUI.checkingEvidence')
        )}
      </StatusAlert>
      {verification.data && (
        <section aria-label={t('commissioningUI.qualification')}>
          <h3>
            {t(verification.runtimeVerified ? 'commissioningUI.configurationVerified' : 'commissioningUI.setupChecks')}
          </h3>
          <ul>
            <li>
              {t('commissioningUI.configuration', {
                status: t(
                  verification.data.configurationApplied ? 'commissioningUI.applied' : 'commissioningUI.pending',
                ),
              })}
            </li>
            <li>
              {t('commissioningUI.hardwareProbe', {
                status: tBackendMessage(verification.data.hardwareReadiness ?? t('commissioningUI.unverified')),
              })}
            </li>
            <li>
              {t('commissioningUI.managementStatus', {
                status: tBackendMessage(verification.data.managementHardening),
              })}
            </li>
            <li>{t('commissioningUI.physicalQualification')}</li>
          </ul>
        </section>
      )}
      {managementControllerId && (
        <>
          {onConfigure && controllerId && (
            <Button onPress={() => onConfigure(controllerId)}>{t('commissioningUI.configure')}</Button>
          )}
          <CommissioningSecurityPanel key={session.id} sessionId={session.id} controllerId={managementControllerId} />
        </>
      )}
    </div>
  );
}
