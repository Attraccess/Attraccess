import { useWagoTranslations } from './i18n';
import { parseActivityLog } from './CommissioningModal.error-alert.helpers';
import { formatActivity } from './CommissioningModal.error-alert.helpers';
import type { CommissioningSession } from './api';
import { Button } from '@heroui/react';
import type { CommissioningModel } from './CommissioningModal.contracts';
import { DrawerFooter } from '@heroui/react';
import { useCommissioningVerification } from './useCommissioningVerification';
import { CreateSessionActions } from './CommissioningModal.create-session-actions.helpers';
import { ErrorAlert } from './CommissioningModal.error-alert.helpers';

export function ActivityLog({ auditLog }: { auditLog: string }) {
  const { t, language } = useWagoTranslations();
  const events = parseActivityLog(auditLog);
  if (!events.length) return null;
  return (
    <div className="wg:mt-4 wg:border-t wg:border-default-200 wg:pt-3">
      <p className="wg:text-xs wg:font-semibold wg:uppercase wg:tracking-wider wg:text-muted">
        {t('commissioningUI.activity')}
      </p>
      <ol className="wg:mt-2 wg:space-y-1">
        {events.map((event) => (
          <li key={`${event.at}-${event.event}`} className="wg:text-xs wg:text-muted">
            <span className="wg:text-foreground">{formatActivity(event.event)}</span>{' '}
            <span>{new Date(event.at).toLocaleTimeString(language)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function canInstall(session: CommissioningSession) {
  return (
    !session.runtimeRecoveryAvailable &&
    !['starting', 'started', 'recovery_required', 'recovering'].includes(session.dockerProvisionState ?? '') &&
    ['awaiting_delivery', 'delivery_failed', 'awaiting_codesys_confirmation'].includes(session.state)
  );
}

export function canRecover(session: CommissioningSession) {
  return session.runtimeRecoveryAvailable === true;
}

export function CancelSessionAction({ model }: { model: CommissioningModel }) {
  const { t } = useWagoTranslations();
  const { session, isLoading, removeSessionMutation, isCancelConfirmationOpen, setCancelConfirmationOpen, close } =
    model;
  return (
    <>
      {session &&
        session.state !== 'completed' &&
        (isCancelConfirmationOpen ? (
          <Button
            variant="danger"
            isPending={isLoading}
            onPress={() => removeSessionMutation.mutate(session.id, { onSuccess: close })}
          >
            {t(isLoading ? 'commissioningUI.removing' : 'commissioningUI.confirmCancel')}
          </Button>
        ) : (
          <Button variant="secondary" isDisabled={isLoading} onPress={() => setCancelConfirmationOpen(true)}>
            {t(session.state === 'revoked' ? 'commissioningUI.deleteRecord' : 'commissioningUI.cancel')}
          </Button>
        ))}
    </>
  );
}

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

export function CommissioningErrors({ model }: { model: CommissioningModel }) {
  const {
    createSessionMutation,
    confirmHostKeyMutation,
    deliverSessionMutation,
    removeSessionMutation,
    recoverSessionMutation,
  } = model;
  return (
    <>
      {createSessionMutation.isError && <ErrorAlert error={createSessionMutation.error} />}
      {confirmHostKeyMutation.isError && <ErrorAlert error={confirmHostKeyMutation.error} />}
      {deliverSessionMutation.isError && <ErrorAlert error={deliverSessionMutation.error} />}
      {removeSessionMutation.isError && <ErrorAlert error={removeSessionMutation.error} />}
      {recoverSessionMutation.isError && <ErrorAlert error={recoverSessionMutation.error} />}
    </>
  );
}
