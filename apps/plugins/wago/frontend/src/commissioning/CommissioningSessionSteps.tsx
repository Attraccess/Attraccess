import type { CommissioningSession } from '../api/client';
import { useWagoTranslations } from '../i18n';
import { RuntimeUpdateDetails } from '../runtime/RuntimeUpdateDetails';
import { canInstall, type SshCredentials } from './model';
import { ActivityLog } from './status/ActivityLog';
import { VerificationStatus } from './status/VerificationStatus';
import { CommissioningPlatformPreflight } from './workflow/CommissioningPlatformPreflight';
import { DeliveryStep } from './workflow/DeliveryStep';
import { HostKeyConfirmationStep } from './workflow/HostKeyConfirmationStep';
import { ProgressStep } from './workflow/ProgressStep';

interface CommissioningSessionStepsProps {
  session: CommissioningSession;
  activeStep: number;
  isDelivering: boolean;
  delivery: SshCredentials;
  onDeliveryChange: (update: (current: SshCredentials) => SshCredentials) => void;
  onConfirmHostKey: (fingerprint: string) => void;
  onConfigure?: (controllerId: number) => void;
}

/** The drawer body sections for an existing session, from identity confirmation to verification. */
export function CommissioningSessionSteps({
  session,
  activeStep,
  isDelivering,
  delivery,
  onDeliveryChange,
  onConfirmHostKey,
  onConfigure,
}: CommissioningSessionStepsProps) {
  const { t } = useWagoTranslations();
  const awaitingIdentity = session.state === 'awaiting_identity_confirmation';
  return (
    <>
      {awaitingIdentity && (
        <HostKeyConfirmationStep
          key={session.id}
          expectedFingerprint={session.hostKeyFingerprint}
          onConfirm={onConfirmHostKey}
        />
      )}
      {activeStep === 2 && !awaitingIdentity && (
        <DeliveryStep
          isDelivering={isDelivering}
          session={session}
          credentials={delivery}
          onCredentialsChange={onDeliveryChange}
        />
      )}
      {activeStep === 3 && <ProgressStep session={session} />}
      {(session.platformReport || session.dockerProvisionState || canInstall(session)) && (
        <details>
          <summary>{t('commissioningUI.diagnostics')}</summary>
          <CommissioningPlatformPreflight key={`preflight-${session.id}`} session={session} showFailure={false} />
          <ActivityLog auditLog={session.auditLog} />
        </details>
      )}
      {session.managedAccessAvailable && session.failureReason && (
        <details>
          <summary>{t('runtimeManagement.recoveryTitle')}</summary>
          <RuntimeUpdateDetails target={{ session }} />
        </details>
      )}
      {(['awaiting_verification', 'completed'].includes(session.state) || session.managementControllerId) && (
        <VerificationStatus session={session} onConfigure={onConfigure} />
      )}
    </>
  );
}
