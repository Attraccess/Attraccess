import { Button } from '@attraccess/plugins-frontend-ui';
import type { CommissioningSession } from '../../api/client';
import { useWagoTranslations } from '../../i18n';
import { canRecover, type SshCredentials } from '../model';

interface RecoverSessionActionProps {
  session: CommissioningSession | null;
  credentials: SshCredentials;
  isLoading: boolean;
  isRecovering: boolean;
  onRecover: () => void;
}

export function RecoverSessionAction({
  session,
  credentials,
  isLoading,
  isRecovering,
  onRecover,
}: RecoverSessionActionProps) {
  const { t } = useWagoTranslations();
  if (!session || !canRecover(session)) return null;
  return (
    <Button
      variant="danger"
      isPending={isRecovering}
      isDisabled={isLoading || !credentials.username.trim() || !credentials.password}
      onPress={onRecover}
    >
      {t('commissioningUI.cleanup')}
    </Button>
  );
}
