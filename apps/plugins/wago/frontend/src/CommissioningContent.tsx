import { Alert, DrawerBody } from '@heroui/react';
import { useCommissioningVerification } from './useCommissioningVerification';
import { CommissioningPlatformPreflight } from './CommissioningPlatformPreflight';
import { RuntimeUpdateDetails } from './ControllersTable';
import { useWagoTranslations } from './i18n';
import { DEFAULT_SSH } from './CommissioningModal.default-ssh';
import { CompletedSessionSummary } from './CommissioningModal.completed-session-summary';
import { StepHeading } from './CommissioningModal.step-heading';
import { OperationStatus } from './CommissioningModal.operation-status';
import { HostKeyConfirmationStep } from './CommissioningModal.host-key-confirmation-step';
import { canInstall } from './CommissioningModal.can-install';
import { DeliveryStep } from './CommissioningModal.delivery-step';
import { ProgressStep } from './CommissioningModal.progress-step';
import { VerificationStatus } from './CommissioningModal.verification-status';
import { ActivityLog } from './CommissioningModal.activity-log';
import { CommissioningModel } from './CommissioningModal';
import { RecoveryFields } from './RecoveryFields';
import { ConnectionFields } from './ConnectionFields';
import { CommissioningErrors } from './CommissioningErrors';
import { CommissioningLiveStatus } from './CommissioningLiveStatus';

export function CommissioningContent({ model }: { model: CommissioningModel }) {
  const { t } = useWagoTranslations();
  const {
    onConfigure,
    session,
    activeStep,
    title,
    loadingStatus,
    hostKeyFingerprint,
    setHostKeyFingerprint,
    deliverSessionMutation,
    sshUsername,
    sshPassword,
    setSshUsername,
    setSshPassword,
    customSsh,
    setCustomSsh,
    isCancelConfirmationOpen,
    configureController,
  } = model;
  // Fallback keeps this hook call unconditional across renders where session becomes null.
  const verification = useCommissioningVerification(session ?? { id: -1, state: 'revoked' });
  const isFullyDone = !!session && verification.runtimeVerified === true;
  return (
    <DrawerBody>
      <div>
        <div className="wg:min-w-0 wg:space-y-5">
          {session && isFullyDone ? (
            <CompletedSessionSummary
              session={session}
              verification={verification}
              onConfigure={onConfigure ? configureController : undefined}
            />
          ) : (
            <>
              <StepHeading
                step={activeStep}
                identity={session?.state === 'awaiting_identity_confirmation'}
                failed={Boolean(session?.failureReason)}
              />
              {session && <CommissioningLiveStatus model={model} />}
              {loadingStatus && <OperationStatus title={loadingStatus[0]} description={loadingStatus[1]} />}
              <ConnectionFields model={model} />
              {session?.state === 'awaiting_identity_confirmation' && (
                <HostKeyConfirmationStep
                  fingerprint={hostKeyFingerprint}
                  expectedFingerprint={session.hostKeyFingerprint}
                  onFingerprintChange={setHostKeyFingerprint}
                  onConfirm={() => model.confirmHostKey()}
                />
              )}
              {session && activeStep === 2 && session.state !== 'awaiting_identity_confirmation' && (
                <DeliveryStep
                  isDelivering={deliverSessionMutation.isPending}
                  session={session}
                  sshUsername={sshUsername}
                  sshPassword={sshPassword}
                  onSshUsernameChange={setSshUsername}
                  onSshPasswordChange={setSshPassword}
                  customSsh={customSsh}
                  onCustomSshChange={(custom) => {
                    setCustomSsh(custom);
                    setSshUsername(custom ? '' : DEFAULT_SSH.username);
                    setSshPassword(custom ? '' : DEFAULT_SSH.password);
                  }}
                />
              )}
              {session && activeStep === 3 && <ProgressStep name={title} session={session} />}
              {session && (session.platformReport || session.dockerProvisionState || canInstall(session)) && (
                <details>
                  <summary>{t('commissioningUI.diagnostics')}</summary>
                  <CommissioningPlatformPreflight
                    key={`preflight-${session.id}`}
                    session={session}
                    showFailure={false}
                  />
                  <ActivityLog auditLog={session.auditLog} />
                </details>
              )}
              {session?.managedAccessAvailable && session.failureReason && (
                <details>
                  <summary>{t('runtimeManagement.recoveryTitle')}</summary>
                  <RuntimeUpdateDetails target={{ session }} />
                </details>
              )}
              {session &&
                (['awaiting_verification', 'completed'].includes(session.state) || session.managementControllerId) && (
                  <VerificationStatus session={session} onConfigure={onConfigure ? configureController : undefined} />
                )}
              <RecoveryFields model={model} />
              <CommissioningErrors model={model} />
              {isCancelConfirmationOpen && (
                <Alert status="warning">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{t('commissioningUI.cancelDescription')}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </>
          )}
        </div>
      </div>
    </DrawerBody>
  );
}
