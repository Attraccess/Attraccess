import { Alert } from '@heroui/react';
import { CommissioningSession } from './api';
import { useWagoTranslations } from './i18n';
import { CommissioningStatusPanel } from './CommissioningModal.commissioning-status-panel';
import { canInstall } from './CommissioningModal.can-install';
import { CredentialFields } from './CommissioningModal.credential-fields';

export function DeliveryStep({
  isDelivering,
  session,
  sshUsername,
  sshPassword,
  onSshUsernameChange,
  onSshPasswordChange,
  customSsh,
  onCustomSshChange,
}: {
  isDelivering: boolean;
  session: CommissioningSession;
  sshUsername: string;
  sshPassword: string;
  onSshUsernameChange: (value: string) => void;
  onSshPasswordChange: (value: string) => void;
  customSsh: boolean;
  onCustomSshChange: (value: boolean) => void;
}) {
  const { t } = useWagoTranslations();
  return (
    <div className="wg:space-y-4">
      <CommissioningStatusPanel isActive={isDelivering || session.state === 'delivering'} session={session} />
      {canInstall(session) && (
        <>
          <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{t('commissioningUI.destructive')}</Alert.Title>
              <Alert.Description>
                {t('commissioningUI.destructiveDescription', { host: session.targetHost })}
              </Alert.Description>
            </Alert.Content>
          </Alert>
          <CredentialFields
            isDisabled={isDelivering}
            username={sshUsername}
            password={sshPassword}
            onUsernameChange={onSshUsernameChange}
            onPasswordChange={onSshPasswordChange}
            custom={customSsh}
            onCustomChange={onCustomSshChange}
          />
        </>
      )}
    </div>
  );
}
