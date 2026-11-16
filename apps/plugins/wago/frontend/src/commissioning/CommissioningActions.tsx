import { Button } from '@attraccess/plugins-frontend-ui';
import { DrawerFooter } from '@heroui/react';
import { useWagoTranslations } from '../i18n';
import { canInstall, canRecover } from './model';
import { useCommissioningVerification } from './status/useCommissioningVerification';
import type { CommissioningState } from './useCommissioningState';
import { CancelSessionAction } from './workflow/CancelSessionAction';
import { CreateSessionActions } from './workflow/CreateSessionActions';

export function CommissioningActions({ state }: { state: CommissioningState }) {
  const { t } = useWagoTranslations();
  const {
    session,
    isLoading,
    sshUsername,
    sshPassword,
    recoveryUsername,
    recoveryPassword,
    recoverPending,
    isCancelConfirmationOpen,
    setCancelConfirmationOpen,
    close,
    deliverSession,
    recoverSession,
    confirmHostKey,
  } = state;
  // Fallback keeps this hook call unconditional across renders where session becomes null.
  const verification = useCommissioningVerification(session ?? { id: -1, state: 'revoked' });
  if (session && verification.runtimeVerified === true) {
    return (
      <DrawerFooter>
        <Button variant="secondary" onPress={close}>
          {t('commissioningUI.close')}
        </Button>
      </DrawerFooter>
    );
  }
  return (
    <DrawerFooter className="wg:flex-wrap">
      {session && canRecover(session) && (
        <Button
          variant="danger"
          isPending={recoverPending}
          isDisabled={isLoading || !recoveryUsername.trim() || !recoveryPassword}
          onPress={recoverSession}
        >
          {t('commissioningUI.cleanup')}
        </Button>
      )}
      <Button variant="secondary" onPress={isCancelConfirmationOpen ? () => setCancelConfirmationOpen(false) : close}>
        {t(isCancelConfirmationOpen ? 'commissioningUI.keep' : 'commissioningUI.close')}
      </Button>
      <CreateSessionActions
        session={session}
        isLoading={isLoading}
        activeStep={state.activeStep}
        name={state.name}
        controllerIp={state.controllerIp}
        mqttServersQuery={state.mqttServersQuery}
        artifactBusy={state.artifactBusy}
        artifactAvailable={state.artifactAvailable}
        selectedMqttServerId={state.selectedMqttServerId}
        setStep={state.setStep}
      />
      {session?.state === 'awaiting_identity_confirmation' && (
        <Button isPending={isLoading} onPress={() => confirmHostKey(true)}>
          {t('commissioningUI.useController')}
        </Button>
      )}
      {session && canInstall(session) && (
        <Button
          variant="danger"
          isPending={isLoading}
          isDisabled={isLoading || !sshUsername.trim() || !sshPassword}
          onPress={deliverSession}
        >
          {t(
            isLoading
              ? 'commissioningUI.starting'
              : session.state === 'delivery_failed'
                ? 'commissioningUI.retry'
                : 'commissioningUI.install',
          )}
        </Button>
      )}
      <CancelSessionAction
        session={session}
        isLoading={isLoading}
        isCancelConfirmationOpen={isCancelConfirmationOpen}
        setCancelConfirmationOpen={setCancelConfirmationOpen}
        removeSession={state.removeSession}
      />
    </DrawerFooter>
  );
}
