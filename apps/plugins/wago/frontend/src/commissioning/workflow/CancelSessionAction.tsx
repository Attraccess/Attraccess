import { Button } from '@attraccess/plugins-frontend-ui';
import { useWagoTranslations } from '../../i18n';
import type { CommissioningState } from '../useCommissioningState';

type CancelSessionActionProps = Pick<
  CommissioningState,
  'session' | 'isLoading' | 'isCancelConfirmationOpen' | 'setCancelConfirmationOpen' | 'removeSession'
>;

export function CancelSessionAction({
  session,
  isLoading,
  isCancelConfirmationOpen,
  setCancelConfirmationOpen,
  removeSession,
}: CancelSessionActionProps) {
  const { t } = useWagoTranslations();
  return (
    <>
      {session &&
        session.state !== 'completed' &&
        (isCancelConfirmationOpen ? (
          <Button variant="danger" isPending={isLoading} onPress={() => removeSession(session.id)}>
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
