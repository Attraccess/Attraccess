import { Alert } from '@heroui/react';
import { useWagoTranslations } from './i18n';
import { DEFAULT_SSH } from './CommissioningModal.state';
import { canRecover } from './CommissioningModal.activity-log.helpers';
import { CredentialFields } from './CommissioningModal.create-session-actions.helpers';
import type { CommissioningModel } from './CommissioningModal.contracts';
import type { CommissioningSession } from './api';

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

export function sessionStep(session: CommissioningSession | null): number {
  if (!session) return 0;
  if (session.state === 'awaiting_identity_confirmation') return 2;
  return ['awaiting_delivery', 'delivering', 'awaiting_codesys_confirmation', 'delivery_failed'].includes(session.state)
    ? 2
    : 3;
}

export function StepHeading({ step, identity, failed }: { step: number; identity: boolean; failed: boolean }) {
  const { t } = useWagoTranslations();
  return (
    <div>
      <p className="wg:text-sm wg:font-medium">{t('commissioningUI.step', { step: step + 1 })}</p>
      <h2 className="wg:mt-1 wg:text-xl wg:font-semibold">
        {t(
          failed
            ? 'commissioningUI.setupFailed'
            : identity
              ? 'commissioningUI.verifyController'
              : `commissioningUI.steps.${step}.title`,
        )}
      </h2>
      <p className="wg:mt-1 wg:text-sm wg:text-muted">
        {t(
          failed
            ? 'commissioningUI.failureIntro'
            : identity
              ? 'commissioningUI.isolatedConnectionHint'
              : `commissioningUI.steps.${step}.description`,
        )}
      </p>
    </div>
  );
}
export function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="wg:text-xs wg:text-muted">{label}</dt>
      <dd className="wg:font-medium">{value}</dd>
    </div>
  );
}
