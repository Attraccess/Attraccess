import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import type { CommissioningSession } from '../../api/client';
import { useWagoTranslations } from '../../i18n';
import { canInstall, sshCredentials, type SshCredentials } from '../model';
import { CommissioningStatusPanel } from '../status/CommissioningStatusPanel';
import { CredentialFields } from './CredentialFields';

export function DeliveryStep({
  isDelivering,
  session,
  credentials,
  onCredentialsChange,
}: {
  isDelivering: boolean;
  session: CommissioningSession;
  credentials: SshCredentials;
  onCredentialsChange: (update: (current: SshCredentials) => SshCredentials) => void;
}) {
  const { t } = useWagoTranslations();
  return (
    <div className="wg:space-y-4">
      <CommissioningStatusPanel isActive={isDelivering || session.state === 'delivering'} session={session} />
      {canInstall(session) && (
        <>
          <StatusAlert status="warning" title={t('commissioningUI.destructive')}>
            {t('commissioningUI.destructiveDescription', { host: session.targetHost })}
          </StatusAlert>
          <CredentialFields
            isDisabled={isDelivering}
            username={credentials.username}
            password={credentials.password}
            onUsernameChange={(username) => onCredentialsChange((current) => ({ ...current, username }))}
            onPasswordChange={(password) => onCredentialsChange((current) => ({ ...current, password }))}
            custom={credentials.custom}
            onCustomChange={(custom) => onCredentialsChange(() => sshCredentials(custom))}
          />
        </>
      )}
    </div>
  );
}
