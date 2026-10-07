import { Alert } from '@heroui/react';
import { useWagoTranslations } from './i18n';
import { DEFAULT_SSH } from './CommissioningModal.default-ssh';
import { canRecover } from './CommissioningModal.can-recover';
import { CredentialFields } from './CommissioningModal.credential-fields';
import { CommissioningModel } from './CommissioningModal';

export function RecoveryFields({ model }: { model: CommissioningModel }) {
  const { t } = useWagoTranslations();
  const {
    session,
    isLoading,
    recoveryUsername,
    recoveryPassword,
    setRecoveryUsername,
    setRecoveryPassword,
    customRecoverySsh,
    setCustomRecoverySsh,
  } = model;
  return (
    <>
      {session && canRecover(session) && (
        <div className="wg:space-y-4">
          <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{t('commissioningUI.cleanup')}</Alert.Title>
              <Alert.Description>{t('commissioningUI.cleanupDescription')}</Alert.Description>
            </Alert.Content>
          </Alert>
          <CredentialFields
            intent="recovery"
            managed={session.managedAccessAvailable}
            isDisabled={isLoading}
            username={recoveryUsername}
            password={recoveryPassword}
            onUsernameChange={setRecoveryUsername}
            onPasswordChange={setRecoveryPassword}
            custom={customRecoverySsh}
            onCustomChange={(custom) => {
              setCustomRecoverySsh(custom);
              setRecoveryUsername(custom ? '' : DEFAULT_SSH.username);
              setRecoveryPassword(custom ? '' : DEFAULT_SSH.password);
            }}
          />
        </div>
      )}
    </>
  );
}
