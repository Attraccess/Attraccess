import { Button } from '@heroui/react';
import { useWagoTranslations } from '../i18n';
import { CommissioningModel } from './CommissioningModal';

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
