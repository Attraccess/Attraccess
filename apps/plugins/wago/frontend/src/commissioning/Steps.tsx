import { Alert, Button, Input, Key, Label, ListBox, Select, Spinner, TextField } from '@heroui/react';
import { CommissioningSession } from '../api/client';
import { useMqttServersQuery } from '../api/queries';
import { useWagoTranslations } from '../i18n';
import { canInstall } from './model';
import { CommissioningStatusPanel } from './Status';
import { useCommissioningVerification } from './useCommissioningVerification';

export function ErrorAlert({ error }: { error: unknown }) {
  const { t } = useWagoTranslations();
  return (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>{error instanceof Error ? error.message : t('common.retry')}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

export function ConnectionStep({
  controllerIp,
  mqttServerId,
  mqttServersQuery,
  selectedMqttServerId,
  onControllerIpChange,
  onMqttServerIdChange,
}: {
  controllerIp: string;
  mqttServerId: Key | null;
  mqttServersQuery: ReturnType<typeof useMqttServersQuery>;
  selectedMqttServerId: number | null;
  onControllerIpChange: (value: string) => void;
  onMqttServerIdChange: (value: Key | null) => void;
}) {
  const { t } = useWagoTranslations();
  return (
    <div className="wg:space-y-4">
      <Alert status="accent">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{t('commissioningUI.prepare')}</Alert.Title>
          <Alert.Description>{t('commissioningUI.prepareDescription')}</Alert.Description>
        </Alert.Content>
      </Alert>
      <TextField isRequired name="controller-ip">
        <Label>{t('commissioningUI.ip')}</Label>
        <Input
          value={controllerIp}
          placeholder="192.168.1.42"
          onChange={(event) => onControllerIpChange(event.target.value)}
        />
      </TextField>
      {mqttServersQuery.isPending ? (
        <div className="wg:flex wg:justify-center wg:p-2">
          <Spinner color="accent" size="sm" />
        </div>
      ) : mqttServersQuery.isError ? (
        <ErrorAlert error={mqttServersQuery.error} />
      ) : (mqttServersQuery.data?.length ?? 0) > 1 ? (
        <Select
          className="wg:w-full"
          name="mqttServerId"
          placeholder={t('settings.select')}
          value={mqttServerId}
          onChange={onMqttServerIdChange}
        >
          <Label>{t('commissioningUI.mqtt')}</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox
              renderEmptyState={() => (
                <span className="wg:block wg:p-3 wg:text-sm wg:text-muted">{t('settings.empty')}</span>
              )}
            >
              {(mqttServersQuery.data ?? []).map((server) => (
                <ListBox.Item key={server.id} id={server.id.toString()} textValue={server.name}>
                  <div className="wg:min-w-0 wg:truncate">{server.name}</div>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      ) : !selectedMqttServerId ? (
        <p role="alert">{t('settings.empty')}</p>
      ) : null}
    </div>
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

export function HostKeyConfirmationStep({
  fingerprint,
  expectedFingerprint,
  onFingerprintChange,
  onConfirm,
}: {
  fingerprint: string;
  expectedFingerprint: string;
  onFingerprintChange: (value: string) => void;
  onConfirm: () => void;
}) {
  const { t } = useWagoTranslations();
  return (
    <details>
      <summary>{t('commissioningUI.trustedFingerprint')}</summary>
      <p className="wg:break-all wg:text-sm">{t('commissioningUI.scannedKey', { fingerprint: expectedFingerprint })}</p>
      <TextField isRequired name="host-key-fingerprint">
        <Label>{t('commissioningUI.reviewedKey')}</Label>
        <Input value={fingerprint} onChange={(event) => onFingerprintChange(event.target.value)} />
      </TextField>
      <Button variant="secondary" isDisabled={!fingerprint || fingerprint !== expectedFingerprint} onPress={onConfirm}>
        {t('commissioningUI.confirmKey')}
      </Button>
    </details>
  );
}

export function NameStep({ name, onNameChange }: { name: string; onNameChange: (name: string) => void }) {
  const { t } = useWagoTranslations();
  return (
    <TextField isRequired name="controller-name">
      <Label>{t('claim.name')}</Label>
      <Input
        autoFocus
        value={name}
        placeholder={t('commissioningUI.namePlaceholder')}
        onChange={(event) => onNameChange(event.target.value)}
      />
    </TextField>
  );
}

export function ProgressStep({ session }: { name: string; session: CommissioningSession }) {
  const { t, tBackendMessage } = useWagoTranslations();
  const verification = useCommissioningVerification(session);
  const complete =
    verification.enrollmentComplete ||
    ['completed', 'revoked', 'claim_interrupted', 'recovery_revocation_pending'].includes(session.state);
  const progress = verification.enrollmentComplete
    ? {
        ...session,
        progressStep: t('commissioningUI.enrollmentComplete'),
        progressDetail: verification.runtimeVerified
          ? t('commissioningUI.verifiedDescription')
          : t('commissioningUI.setupPendingDescription'),
      }
    : session;
  return (
    <div className="wg:space-y-4">
      <CommissioningStatusPanel isActive={!complete} session={progress} />
      <div className="wg:rounded-large wg:border wg:border-default-200 wg:p-4 wg:text-sm">
        <p className="wg:font-medium">{t('commissioningUI.safeToClose')}</p>
        <p className="wg:mt-1 wg:text-muted">{t('commissioningUI.savedDescription')}</p>
      </div>
      {session.failureReason && (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t('runtimeManagement.lastSetupFailure')}</Alert.Title>
            <Alert.Description>{tBackendMessage(session.failureReason)}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </div>
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
