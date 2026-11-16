import { AlertStatusIcon } from '@attraccess/plugins-frontend-ui';
import { Alert, DrawerBody } from '@heroui/react';
import { RuntimeUpdateDetails } from '../runtime/RuntimeUpdateDetails';
import { useWagoTranslations } from '../i18n';
import { canInstall, DEFAULT_SSH } from './model';
import { ActivityLog } from './status/ActivityLog';
import { CommissioningLiveStatus } from './status/CommissioningLiveStatus';
import { CompletedSessionSummary } from './status/CompletedSessionSummary';
import { OperationStatus } from './status/OperationStatus';
import { useCommissioningVerification } from './status/useCommissioningVerification';
import { VerificationStatus } from './status/VerificationStatus';
import type { CommissioningState } from './useCommissioningState';
import { CommissioningErrors } from './workflow/CommissioningErrors';
import { CommissioningPlatformPreflight } from './workflow/CommissioningPlatformPreflight';
import { ConnectionFields } from './workflow/ConnectionFields';
import { DeliveryStep } from './workflow/DeliveryStep';
import { HostKeyConfirmationStep } from './workflow/HostKeyConfirmationStep';
import { ProgressStep } from './workflow/ProgressStep';
import { RecoveryFields } from './workflow/RecoveryFields';
import { StepHeading } from './workflow/StepHeading';

export function CommissioningContent({ state }: { state: CommissioningState }) {
  const { t } = useWagoTranslations();
  const {
    onConfigure,
    session,
    activeStep,
    loadingStatus,
    hostKeyFingerprint,
    setHostKeyFingerprint,
    deliverPending,
    sshUsername,
    sshPassword,
    setSshUsername,
    setSshPassword,
    customSsh,
    setCustomSsh,
    isCancelConfirmationOpen,
    configureController,
  } = state;
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
              {session && (
                <CommissioningLiveStatus
                  session={state.session}
                  sessionsQuery={state.sessionsQuery}
                  deliverPending={state.deliverPending}
                  recoverPending={state.recoverPending}
                />
              )}
              {loadingStatus && <OperationStatus title={loadingStatus[0]} description={loadingStatus[1]} />}
              <ConnectionFields
                session={session}
                isLoading={state.isLoading}
                activeStep={activeStep}
                name={state.name}
                setName={state.setName}
                controllerIp={state.controllerIp}
                setControllerIp={state.setControllerIp}
                mqttServerId={state.mqttServerId}
                setMqttServerId={state.setMqttServerId}
                selectedMqttServerId={state.selectedMqttServerId}
                mqttServersQuery={state.mqttServersQuery}
                setArtifactBusy={state.setArtifactBusy}
                setSelectedArtifact={state.setSelectedArtifact}
                setStep={state.setStep}
                createSession={state.createSession}
              />
              {session?.state === 'awaiting_identity_confirmation' && (
                <HostKeyConfirmationStep
                  fingerprint={hostKeyFingerprint}
                  expectedFingerprint={session.hostKeyFingerprint}
                  onFingerprintChange={setHostKeyFingerprint}
                  onConfirm={() => state.confirmHostKey()}
                />
              )}
              {session && activeStep === 2 && session.state !== 'awaiting_identity_confirmation' && (
                <DeliveryStep
                  isDelivering={deliverPending}
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
              {session && activeStep === 3 && <ProgressStep session={session} />}
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
              <RecoveryFields
                session={session}
                isLoading={state.isLoading}
                recoveryUsername={state.recoveryUsername}
                recoveryPassword={state.recoveryPassword}
                setRecoveryUsername={state.setRecoveryUsername}
                setRecoveryPassword={state.setRecoveryPassword}
                customRecoverySsh={state.customRecoverySsh}
                setCustomRecoverySsh={state.setCustomRecoverySsh}
              />
              <CommissioningErrors errorMessages={state.errorMessages} />
              {isCancelConfirmationOpen && (
                <Alert status="warning">
                  <AlertStatusIcon status="warning" />
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
