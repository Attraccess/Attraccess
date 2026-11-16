import { Button } from '@attraccess/plugins-frontend-ui';
import type { CommissioningSession } from '../../api/client';
import { useWagoTranslations } from '../../i18n';

interface CancelSessionActionProps {
  session: CommissioningSession | null;
  isLoading: boolean;
  isConfirmationOpen: boolean;
  onConfirmationOpenChange: (open: boolean) => void;
  onRemove: (id: number) => void;
}

export function CancelSessionAction({
  session,
  isLoading,
  isConfirmationOpen,
  onConfirmationOpenChange,
  onRemove,
}: CancelSessionActionProps) {
  const { t } = useWagoTranslations();
  if (!session || session.state === 'completed') return null;
  return isConfirmationOpen ? (
    <Button variant="danger" isPending={isLoading} onPress={() => onRemove(session.id)}>
      {t(isLoading ? 'commissioningUI.removing' : 'commissioningUI.confirmCancel')}
    </Button>
  ) : (
    <Button variant="secondary" isDisabled={isLoading} onPress={() => onConfirmationOpenChange(true)}>
      {t(session.state === 'revoked' ? 'commissioningUI.deleteRecord' : 'commissioningUI.cancel')}
    </Button>
  );
}
