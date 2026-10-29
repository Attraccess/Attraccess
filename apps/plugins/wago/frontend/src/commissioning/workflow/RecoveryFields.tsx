import { StatusAlert } from '@attraccess/plugins-frontend-ui';

import { useWagoTranslations } from '../../i18n';
import { DEFAULT_SSH } from '../model';
import { canRecover } from '../model';
import { CredentialFields } from './Steps';
import { CommissioningModel } from '../CommissioningModal';

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
          <StatusAlert status="warning" title={t('commissioningUI.cleanup')}>
            {t('commissioningUI.cleanupDescription')}
          </StatusAlert>
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
