import { Button } from '@heroui/react';
import { useWagoTranslations } from './i18n';
import type { CommissioningModel } from './CommissioningModal.contracts';
import { Input } from '@heroui/react';
import { Label } from '@heroui/react';
import { TextField } from '@heroui/react';
import { Alert } from '@heroui/react';
import type { CommissioningSession } from './api';
import { CommissioningStatusPanel } from './CommissioningModal.commissioning-status-panel.helpers';
import { canInstall } from './CommissioningModal.activity-log.helpers';

export function CreateSessionActions({ model }: { model: CommissioningModel }) {
  const { t } = useWagoTranslations();
  const {
    session,
    isLoading,
    activeStep,
    name,
    controllerIp,
    mqttServersQuery,
    artifactBusy,
    artifactAvailable,
    selectedMqttServerId,
    setStep,
  } = model;
  return (
    <>
      {!session && activeStep === 0 && (
        <Button isDisabled={!name.trim()} type="submit" form="wago-commissioning-connection">
          {t('commissioningUI.continue')}
        </Button>
      )}
      {!session && activeStep === 1 && (
        <>
          <Button variant="secondary" onPress={() => setStep(0)}>
            {t('commissioningUI.back')}
          </Button>
          <Button
            isPending={isLoading}
            type="submit"
            form="wago-commissioning-connection"
            isDisabled={
              artifactBusy ||
              !artifactAvailable ||
              !controllerIp.trim() ||
              selectedMqttServerId === null ||
              mqttServersQuery.isPending ||
              mqttServersQuery.isError
            }
          >
            {t(isLoading ? 'commissioningUI.preparing' : 'commissioningUI.continue')}
          </Button>
        </>
      )}
    </>
  );
}

export function CredentialFields({
  intent = 'installation',
  managed = false,
  isDisabled,
  username,
  password,
  onUsernameChange,
  onPasswordChange,
  custom,
  onCustomChange,
}: {
  intent?: 'installation' | 'recovery';
  managed?: boolean;
  isDisabled: boolean;
  username: string;
  password: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  custom: boolean;
  onCustomChange: (value: boolean) => void;
}) {
  const { t } = useWagoTranslations();
  return (
    <div className="wg:space-y-3">
      <p className="wg:text-sm">
        {t('commissioningUI.sshLogin', {
          account: t(
            custom
              ? 'commissioningUI.custom'
              : managed
                ? 'commissioningUI.managedAccount'
                : 'commissioningUI.defaultAccount',
          ),
        })}
      </p>
      <Button variant="tertiary" size="sm" isDisabled={isDisabled} onPress={() => onCustomChange(!custom)}>
        {t(custom ? 'commissioningUI.useDefaultLogin' : 'commissioningUI.advanced')}
      </Button>
      {custom && (
        <div className="wg:grid wg:gap-4 wg:sm:grid-cols-2">
          <TextField isRequired isDisabled={isDisabled} name={`${intent}-ssh-username`}>
            <Label>{t(`commissioningUI.${intent}Username`)}</Label>
            <Input autoComplete="off" value={username} onChange={(event) => onUsernameChange(event.target.value)} />
          </TextField>
          <TextField isRequired isDisabled={isDisabled} name={`${intent}-ssh-password`}>
            <Label>{t(`commissioningUI.${intent}Password`)}</Label>
            <Input
              autoComplete="off"
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
            />
          </TextField>
        </div>
      )}
    </div>
  );
}

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
