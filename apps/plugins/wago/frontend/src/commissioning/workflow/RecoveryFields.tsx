import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import type { CommissioningSession } from '../../api/client';
import { useWagoTranslations } from '../../i18n';
import { canRecover, sshCredentials, type SshCredentials } from '../model';
import { CredentialFields } from './CredentialFields';

export function RecoveryFields({
  session,
  isLoading,
  credentials,
  onCredentialsChange,
}: {
  session: CommissioningSession | null;
  isLoading: boolean;
  credentials: SshCredentials;
  onCredentialsChange: (update: (current: SshCredentials) => SshCredentials) => void;
}) {
  const { t } = useWagoTranslations();
  if (!session || !canRecover(session)) return null;
  return (
    <div className="wg:space-y-4">
      <StatusAlert status="warning" title={t('commissioningUI.cleanup')}>
        {t('commissioningUI.cleanupDescription')}
      </StatusAlert>
      <CredentialFields
        intent="recovery"
        managed={session.managedAccessAvailable}
        isDisabled={isLoading}
        username={credentials.username}
        password={credentials.password}
        onUsernameChange={(username) => onCredentialsChange((current) => ({ ...current, username }))}
        onPasswordChange={(password) => onCredentialsChange((current) => ({ ...current, password }))}
        custom={credentials.custom}
        onCustomChange={(custom) => onCredentialsChange(() => sshCredentials(custom))}
      />
    </div>
  );
}
