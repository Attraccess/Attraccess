import { Button } from '@attraccess/plugins-frontend-ui';
import type { CommissioningSession } from '../../api/client';
import { useWagoTranslations } from '../../i18n';
import { canInstall, type SshCredentials } from '../model';

interface DeliverSessionActionProps {
  session: CommissioningSession | null;
  credentials: SshCredentials;
  isLoading: boolean;
  onDeliver: () => void;
}

export function DeliverSessionAction({ session, credentials, isLoading, onDeliver }: DeliverSessionActionProps) {
  const { t } = useWagoTranslations();
  if (!session || !canInstall(session)) return null;
  return (
    <Button
      variant="danger"
      isPending={isLoading}
      isDisabled={isLoading || !credentials.username.trim() || !credentials.password}
      onPress={onDeliver}
    >
      {t(
        isLoading
          ? 'commissioningUI.starting'
          : session.state === 'delivery_failed'
            ? 'commissioningUI.retry'
            : 'commissioningUI.install',
      )}
    </Button>
  );
}
