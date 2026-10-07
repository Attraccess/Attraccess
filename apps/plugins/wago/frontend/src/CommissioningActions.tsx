import { Button, DrawerFooter } from '@heroui/react';
import { useCommissioningVerification } from './useCommissioningVerification';
import { useWagoTranslations } from './i18n';
import { canInstall } from './CommissioningModal.can-install';
import { canRecover } from './CommissioningModal.can-recover';
import { CommissioningModel } from './CommissioningModal';
import { CreateSessionActions } from './CreateSessionActions';
import { CancelSessionAction } from './CancelSessionAction';

export function CommissioningActions({ model }: { model: CommissioningModel }) {
  const { t } = useWagoTranslations();
  const {
    session,
    isLoading,
    sshUsername,
    sshPassword,
    recoveryUsername,
    recoveryPassword,
    recoverSessionMutation,
    isCancelConfirmationOpen,
    setCancelConfirmationOpen,
    close,
    deliverSession,
    recoverSession,
    confirmHostKey,
  } = model;
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
          isPending={recoverSessionMutation.isPending}
          isDisabled={isLoading || !recoveryUsername.trim() || !recoveryPassword}
          onPress={recoverSession}
        >
          {t('commissioningUI.cleanup')}
        </Button>
      )}
      <Button variant="secondary" onPress={isCancelConfirmationOpen ? () => setCancelConfirmationOpen(false) : close}>
        {t(isCancelConfirmationOpen ? 'commissioningUI.keep' : 'commissioningUI.close')}
      </Button>
      <CreateSessionActions model={model} />
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
      <CancelSessionAction model={model} />
    </DrawerFooter>
  );
}
