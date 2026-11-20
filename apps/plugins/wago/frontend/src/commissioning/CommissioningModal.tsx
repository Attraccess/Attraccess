import { AlertStatusIcon, Button, StandardDrawer } from '@attraccess/plugins-frontend-ui';
import { Alert, DrawerBody, DrawerFooter, DrawerHeader, DrawerHeading } from '@heroui/react';
import { useWagoTranslations } from '../i18n';
import { CommissioningSessionSteps } from './CommissioningSessionSteps';
import type { CommissioningModalProps } from './model';
import { CommissioningLiveStatus } from './status/CommissioningLiveStatus';
import { commissioningLoadingStatus } from './status/commissioningLoadingStatus';
import { CompletedSessionSummary } from './status/CompletedSessionSummary';
import { OperationStatus } from './status/OperationStatus';
import { useCommissioningVerification } from './status/useCommissioningVerification';
import { useCommissioningState } from './useCommissioningState';
import { CancelSessionAction } from './workflow/CancelSessionAction';
import { CommissioningErrors } from './workflow/CommissioningErrors';
import { ConnectionFields } from './workflow/ConnectionFields';
import { CreateSessionActions } from './workflow/CreateSessionActions';
import { DeliverSessionAction } from './workflow/DeliverSessionAction';
import { RecoverSessionAction } from './workflow/RecoverSessionAction';
import { RecoveryFields } from './workflow/RecoveryFields';
import { StepHeading } from './workflow/StepHeading';

export function CommissioningModal(props: CommissioningModalProps) {
  const { t } = useWagoTranslations();
  const state = useCommissioningState(props);
  const { session, activeStep, pending, isCancelConfirmationOpen, close } = state;
  // Fallback keeps this hook call unconditional across renders where session becomes null.
  const verification = useCommissioningVerification(session ?? { id: -1, state: 'revoked' });
  const loadingStatus = commissioningLoadingStatus(pending, t);
  const { onConfigure } = props;
  const configureController = onConfigure
    ? (controllerId: number) => {
        close();
        onConfigure(controllerId);
      }
    : undefined;
  return (
    <StandardDrawer
      dialogProps={{ 'aria-label': t('commissioningUI.title') }}
      isOpen={props.isOpen}
      onOpenChange={(open) => !open && close()}
    >
      <DrawerHeader>
        <DrawerHeading className="wg:text-xl wg:font-semibold">{t('commissioningUI.title')}</DrawerHeading>
      </DrawerHeader>
      {session && verification.runtimeVerified === true ? (
        <>
          <DrawerBody>
            <div>
              <div className="wg:min-w-0 wg:space-y-5">
                <CompletedSessionSummary
                  session={session}
                  verification={verification}
                  onConfigure={configureController}
                />
              </div>
            </div>
          </DrawerBody>
          <DrawerFooter>
            <Button variant="secondary" onPress={close}>
              {t('commissioningUI.close')}
            </Button>
          </DrawerFooter>
        </>
      ) : (
        <>
          <DrawerBody>
            <div>
              <div className="wg:min-w-0 wg:space-y-5">
                <StepHeading
                  step={activeStep}
                  identity={session?.state === 'awaiting_identity_confirmation'}
                  failed={Boolean(session?.failureReason)}
                />
                {session && (
                  <CommissioningLiveStatus
                    session={session}
                    isOperationPending={pending.delivering || pending.recovering}
                  />
                )}
                {loadingStatus && <OperationStatus title={loadingStatus[0]} description={loadingStatus[1]} />}
                <ConnectionFields
                  session={session}
                  activeStep={activeStep}
                  isLoading={pending.any}
                  form={state.form}
                  onFormChange={state.updateForm}
                  onArtifactBusyChange={state.setArtifactBusy}
                  onArtifactChange={state.setSelectedArtifact}
                  onStepChange={state.setStep}
                  onCreate={state.createSession}
                />
                {session && (
                  <CommissioningSessionSteps
                    session={session}
                    activeStep={activeStep}
                    isDelivering={pending.delivering}
                    delivery={state.delivery}
                    onDeliveryChange={state.setDelivery}
                    onConfirmHostKey={(fingerprint) => state.confirmHostKey(fingerprint)}
                    onConfigure={configureController}
                  />
                )}
                <RecoveryFields
                  session={session}
                  isLoading={pending.any}
                  credentials={state.recovery}
                  onCredentialsChange={state.setRecovery}
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
              </div>
            </div>
          </DrawerBody>
          <DrawerFooter className="wg:flex-wrap">
            <RecoverSessionAction
              session={session}
              credentials={state.recovery}
              isLoading={pending.any}
              isRecovering={pending.recovering}
              onRecover={state.recoverSession}
            />
            <Button
              variant="secondary"
              onPress={isCancelConfirmationOpen ? () => state.setCancelConfirmationOpen(false) : close}
            >
              {t(isCancelConfirmationOpen ? 'commissioningUI.keep' : 'commissioningUI.close')}
            </Button>
            <CreateSessionActions
              session={session}
              activeStep={activeStep}
              isLoading={pending.any}
              form={state.form}
              artifactReady={state.artifactReady}
              onStepChange={state.setStep}
            />
            {session?.state === 'awaiting_identity_confirmation' && (
              <Button isPending={pending.any} onPress={() => state.confirmHostKey(session.hostKeyFingerprint, true)}>
                {t('commissioningUI.useController')}
              </Button>
            )}
            <DeliverSessionAction
              session={session}
              credentials={state.delivery}
              isLoading={pending.any}
              onDeliver={state.deliverSession}
            />
            <CancelSessionAction
              session={session}
              isLoading={pending.any}
              isConfirmationOpen={isCancelConfirmationOpen}
              onConfirmationOpenChange={state.setCancelConfirmationOpen}
              onRemove={state.removeSession}
            />
          </DrawerFooter>
        </>
      )}
    </StandardDrawer>
  );
}
