import {
  Alert,
  Button,
  Checkbox,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Input,
  Label,
  ListBox,
  Select,
  Spinner,
  TextField,
} from '@heroui/react';
import type { Key } from '@heroui/react';
import { AlertCircleIcon, CheckCircle2Icon, CpuIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CommissioningSession } from './api';
import { getCommissioningSupport } from './api';
import { useCommissioningVerification } from './useCommissioningVerification';
import { RuntimeArtifactImport } from './RuntimeArtifactImport';
import type { RuntimeArtifactInfo } from './RuntimeArtifactImport';
import { CommissioningSecurityPanel } from './CommissioningSecurityPanel';
import { CommissioningPlatformPreflight } from './CommissioningPlatformPreflight';
import { useQuery } from '@tanstack/react-query';
import { commissioningLabel } from './ControllersTable';
import { StandardDrawer } from './drawer';
import { useWagoTranslations } from './i18n';
import type { TFunction } from '@attraccess/plugins-frontend-ui';
import {
  useCommissioningSessionsQuery,
  useConfirmCommissioningHostKeyMutation,
  useCreateCommissioningSessionMutation,
  useDeliverCommissioningSessionMutation,
  useRecoverCommissioningSessionMutation,
  useMqttServersQuery,
  useRemoveCommissioningSessionMutation,
  useSettingsQuery,
} from './queries';

interface CommissioningModalProps {
  isOpen: boolean;
  session: CommissioningSession | null;
  onOpenChange: (isOpen: boolean) => void;
  onConfigure?: (controllerId: number) => void;
}

const DEFAULT_SSH = { username: 'root', password: 'wago' };

function useCommissioning({ isOpen, session: resumedSession, onOpenChange, onConfigure }: CommissioningModalProps) {
  const { t } = useWagoTranslations();
  const createSessionMutation = useCreateCommissioningSessionMutation();
  const confirmHostKeyMutation = useConfirmCommissioningHostKeyMutation();
  const deliverSessionMutation = useDeliverCommissioningSessionMutation();
  const recoverSessionMutation = useRecoverCommissioningSessionMutation();
  const removeSessionMutation = useRemoveCommissioningSessionMutation();
  const settingsQuery = useSettingsQuery();
  const mqttServersQuery = useMqttServersQuery();
  const commissioningSessionsQuery = useCommissioningSessionsQuery();
  const [createdSession, setCreatedSession] = useState<CommissioningSession | null>(null);
  const [artifactBusy, setArtifactBusy] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<RuntimeArtifactInfo | null>(null);
  const supportQuery = useQuery({
    queryKey: ['wago', 'commissioning-support'],
    queryFn: getCommissioningSupport,
    enabled: isOpen && !resumedSession,
  });
  const artifactAvailable = selectedArtifact !== null || supportQuery.data?.ready === true;
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [controllerIp, setControllerIp] = useState('');
  const [mqttServerId, setMqttServerId] = useState<Key | null>(null);
  const [hostKeyFingerprint, setHostKeyFingerprint] = useState('');
  const [isolatedIdentity, setIsolatedIdentity] = useState(false);
  useEffect(() => {
    setIsolatedIdentity(false);
    setHostKeyFingerprint('');
  }, [resumedSession?.id, isOpen]);
  const [sshUsername, setSshUsername] = useState(DEFAULT_SSH.username);
  const [sshPassword, setSshPassword] = useState(DEFAULT_SSH.password);
  const [customSsh, setCustomSsh] = useState(false);
  const [confirmInstall, setConfirmInstall] = useState(false);
  const [recoveryUsername, setRecoveryUsername] = useState(DEFAULT_SSH.username);
  const [recoveryPassword, setRecoveryPassword] = useState(DEFAULT_SSH.password);
  const [customRecoverySsh, setCustomRecoverySsh] = useState(false);
  const [confirmRecovery, setConfirmRecovery] = useState(false);
  const [isCancelConfirmationOpen, setCancelConfirmationOpen] = useState(false);

  const attemptSession =
    recoverSessionMutation.submittedAt > deliverSessionMutation.submittedAt
      ? recoverSessionMutation.data
      : deliverSessionMutation.data;
  const mutationSession =
    (attemptSession && (!resumedSession || attemptSession.id === resumedSession.id) ? attemptSession : null) ??
    resumedSession ??
    createdSession;
  const session = mutationSession
    ? (commissioningSessionsQuery.data?.find((candidate) => candidate.id === mutationSession.id) ?? mutationSession)
    : null;
  const selectedMqttServerId = mqttServerId === null ? null : Number(mqttServerId);
  const isLoading =
    createSessionMutation.isPending ||
    confirmHostKeyMutation.isPending ||
    deliverSessionMutation.isPending ||
    recoverSessionMutation.isPending ||
    removeSessionMutation.isPending;
  const loadingStatus = commissioningLoadingStatus(
    {
      recoverSessionMutation,
      createSessionMutation,
      removeSessionMutation,
      confirmHostKeyMutation,
    },
    t,
  );

  useEffect(() => {
    setSshUsername(DEFAULT_SSH.username);
    setSshPassword(DEFAULT_SSH.password);
    setCustomSsh(false);
    setConfirmInstall(false);
    setRecoveryUsername(DEFAULT_SSH.username);
    setRecoveryPassword(DEFAULT_SSH.password);
    setCustomRecoverySsh(false);
    setConfirmRecovery(false);
    setHostKeyFingerprint('');
    setIsolatedIdentity(false);
  }, [isOpen, resumedSession?.id]);

  useEffect(() => {
    if (!isOpen) return;
    setMqttServerId(
      resumedSession?.mqttServerId.toString() ?? settingsQuery.data?.defaultMqttServerId?.toString() ?? null,
    );
    setName(resumedSession?.controllerName ?? '');
    setControllerIp(resumedSession?.targetHost ?? '');
    setStep(sessionStep(resumedSession));
  }, [isOpen, resumedSession, settingsQuery.data?.defaultMqttServerId]);

  function close() {
    setCreatedSession(null);
    setStep(0);
    setName('');
    setControllerIp('');
    setMqttServerId(null);
    setHostKeyFingerprint('');
    setSshUsername(DEFAULT_SSH.username);
    setSshPassword(DEFAULT_SSH.password);
    setCustomSsh(false);
    setConfirmInstall(false);
    setCancelConfirmationOpen(false);
    setRecoveryUsername(DEFAULT_SSH.username);
    setRecoveryPassword(DEFAULT_SSH.password);
    setCustomRecoverySsh(false);
    setConfirmRecovery(false);
    createSessionMutation.reset();
    confirmHostKeyMutation.reset();
    deliverSessionMutation.reset();
    recoverSessionMutation.reset();
    removeSessionMutation.reset();
    onOpenChange(false);
  }

  function createSession() {
    if (artifactBusy || !artifactAvailable) return;
    if (selectedMqttServerId === null) return;
    createSessionMutation.mutate(
      {
        name,
        targetHost: controllerIp,
        mqttServerId: selectedMqttServerId,
      },
      {
        onSuccess: (created) => {
          setCreatedSession(created);
          setStep(3);
        },
      },
    );
  }

  function deliverSession() {
    if (!session || isLoading || !confirmInstall || !sshUsername.trim() || !sshPassword || !canInstall(session)) return;
    deliverSessionMutation.mutate({
      id: session.id,
      confirmInstall: true,
      temporarySsh: { username: sshUsername.trim(), password: sshPassword },
    });
    if (customSsh) setSshPassword('');
    setConfirmInstall(false);
    if (customRecoverySsh) setRecoveryPassword('');
    setConfirmRecovery(false);
  }

  function recoverSession() {
    if (
      !session ||
      isLoading ||
      !canRecover(session) ||
      !confirmRecovery ||
      !recoveryUsername.trim() ||
      !recoveryPassword
    )
      return;
    recoverSessionMutation.mutate({
      id: session.id,
      confirmInstall: true,
      temporarySsh: { username: recoveryUsername.trim(), password: recoveryPassword },
    });
    if (customRecoverySsh) setRecoveryPassword('');
    setConfirmRecovery(false);
    if (customSsh) setSshPassword('');
    setConfirmInstall(false);
  }

  function confirmHostKey() {
    if (!session) return;
    confirmHostKeyMutation.mutate({
      id: session.id,
      hostKeyFingerprint: isolatedIdentity ? session.hostKeyFingerprint : hostKeyFingerprint,
      physicalIdentityConfirmed: isolatedIdentity,
    });
  }

  function configureController(controllerId: number) {
    close();
    onConfigure?.(controllerId);
  }

  const activeStep = session ? sessionStep(session) : step;
  const title = session?.controllerName || name || t('commissioningUI.newController');

  return {
    isOpen,
    onConfigure,
    session,
    isLoading,
    activeStep,
    title,
    loadingStatus,
    name,
    setName,
    controllerIp,
    setControllerIp,
    mqttServerId,
    setMqttServerId,
    mqttServersQuery,
    setArtifactBusy,
    artifactBusy,
    artifactAvailable,
    selectedMqttServerId,
    setSelectedArtifact,
    hostKeyFingerprint,
    setHostKeyFingerprint,
    isolatedIdentity,
    setIsolatedIdentity,
    deliverSessionMutation,
    sshUsername,
    sshPassword,
    setSshUsername,
    setSshPassword,
    customSsh,
    setCustomSsh,
    confirmInstall,
    setConfirmInstall,
    recoveryUsername,
    recoveryPassword,
    setRecoveryUsername,
    setRecoveryPassword,
    customRecoverySsh,
    setCustomRecoverySsh,
    confirmRecovery,
    setConfirmRecovery,
    createSessionMutation,
    confirmHostKeyMutation,
    removeSessionMutation,
    recoverSessionMutation,
    isCancelConfirmationOpen,
    setCancelConfirmationOpen,
    setStep,
    close,
    createSession,
    deliverSession,
    recoverSession,
    confirmHostKey,
    configureController,
  };
}

type CommissioningModel = ReturnType<typeof useCommissioning>;

export function CommissioningModal(props: CommissioningModalProps) {
  const { t } = useWagoTranslations();
  const model = useCommissioning(props);
  return (
    <StandardDrawer
      ariaLabel={t('commissioningUI.title')}
      isOpen={props.isOpen}
      onOpenChange={(open) => !open && model.close()}
    >
      <DrawerHeader>
        <h2 className="wg:text-xl wg:font-semibold">{t('commissioningUI.title')}</h2>
      </DrawerHeader>
      <CommissioningContent model={model} />
      <CommissioningActions model={model} />
    </StandardDrawer>
  );
}

function CommissioningContent({ model }: { model: CommissioningModel }) {
  const { t } = useWagoTranslations();
  const {
    onConfigure,
    session,
    activeStep,
    title,
    loadingStatus,
    hostKeyFingerprint,
    setHostKeyFingerprint,
    isolatedIdentity,
    setIsolatedIdentity,
    deliverSessionMutation,
    sshUsername,
    sshPassword,
    setSshUsername,
    setSshPassword,
    customSsh,
    setCustomSsh,
    confirmInstall,
    setConfirmInstall,
    isCancelConfirmationOpen,
    configureController,
  } = model;
  // Fallback keeps this hook call unconditional across renders where session becomes null.
  const verification = useCommissioningVerification(session ?? { id: -1, state: 'revoked' });
  const isFullyDone = !!session && verification.runtimeVerified === true;
  return (
    <DrawerBody>
      <div className={`wg:grid wg:min-w-0 wg:gap-5 ${isFullyDone ? '' : 'wg:md:grid-cols-[13rem_minmax(0,1fr)]'}`}>
        {/* The step passport only makes sense while a step is still active; the summary below already
            repeats identity/runtime/claim once commissioning is done. */}
        {!isFullyDone && <DevicePassport className="wg:hidden wg:md:block" name={title} step={activeStep} />}
        <div className="wg:min-w-0 wg:space-y-5">
          {session && isFullyDone ? (
            <CompletedSessionSummary
              session={session}
              verification={verification}
              onConfigure={onConfigure ? configureController : undefined}
            />
          ) : (
            <>
              <StepHeading step={activeStep} />
              {loadingStatus && <OperationStatus title={loadingStatus[0]} description={loadingStatus[1]} />}
              <ConnectionFields model={model} />
              {session?.state === 'awaiting_identity_confirmation' && (
                <HostKeyConfirmationStep
                  fingerprint={hostKeyFingerprint}
                  expectedFingerprint={session.hostKeyFingerprint}
                  onFingerprintChange={setHostKeyFingerprint}
                />
              )}
              {session?.state === 'awaiting_identity_confirmation' && (
                <Checkbox isSelected={isolatedIdentity} onChange={setIsolatedIdentity}>
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Checkbox.Content>{t('commissioningUI.isolatedIdentity')}</Checkbox.Content>
                </Checkbox>
              )}
              {session && activeStep === 4 && session.state !== 'awaiting_identity_confirmation' && (
                <DeliveryStep
                  isDelivering={deliverSessionMutation.isPending}
                  session={session}
                  sshUsername={sshUsername}
                  sshPassword={sshPassword}
                  onSshUsernameChange={setSshUsername}
                  onSshPasswordChange={setSshPassword}
                  customSsh={customSsh}
                  onCustomSshChange={(custom) => {
                    setCustomSsh(custom);
                    setSshUsername(custom ? '' : DEFAULT_SSH.username);
                    setSshPassword(custom ? '' : DEFAULT_SSH.password);
                  }}
                  confirmInstall={confirmInstall}
                  onConfirmInstallChange={setConfirmInstall}
                />
              )}
              {session && activeStep === 5 && <ProgressStep name={title} session={session} />}
              {session && canInstall(session) && (
                <details>
                  <summary className="wg:cursor-pointer">{t('commissioningUI.inspect')}</summary>
                  <CommissioningPlatformPreflight key={`preflight-${session.id}`} session={session} />
                </details>
              )}
              {session && !canInstall(session) && session.dockerProvisionState && (
                <CommissioningPlatformPreflight key={`preflight-${session.id}`} session={session} />
              )}
              {session &&
                (['awaiting_verification', 'completed'].includes(session.state) || session.managementControllerId) && (
                  <VerificationStatus session={session} onConfigure={onConfigure ? configureController : undefined} />
                )}
              <RecoveryFields model={model} />
              <CommissioningErrors model={model} />
              {isCancelConfirmationOpen && (
                <Alert status="warning">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{t('commissioningUI.cancelDescription')}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </>
          )}
        </div>
      </div>
    </DrawerBody>
  );
}

/** Read-only recap once commissioning evidence and runtime setup are both verified; nothing here still needs action. */
function CompletedSessionSummary({
  session,
  verification,
  onConfigure,
}: {
  session: CommissioningSession;
  verification: ReturnType<typeof useCommissioningVerification>;
  onConfigure?: (controllerId: number) => void;
}) {
  const { t, language, tBackendMessage } = useWagoTranslations();
  const controllerId = verification.data?.controllerId ?? session.managementControllerId ?? null;
  return (
    <div className="wg:space-y-4">
      <Alert status="success">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{t('commissioningUI.complete')}</Alert.Title>
          <Alert.Description>
            {t('commissioningUI.completeDescription', { name: session.controllerName ?? session.hardwareId })}
          </Alert.Description>
        </Alert.Content>
      </Alert>
      <dl className="wg:grid wg:gap-3 wg:text-sm wg:sm:grid-cols-2">
        <SummaryField label={t('commissioningUI.hardwareId')} value={session.hardwareId} />
        <SummaryField label={t('commissioningUI.firmware')} value={session.firmwareBaseline} />
        <SummaryField
          label={t('commissioningUI.claimed')}
          value={new Date(session.updatedAt).toLocaleString(language)}
        />
        <SummaryField
          label={t('commissioningUI.management')}
          value={tBackendMessage(verification.data?.managementHardening ?? t('commissioningUI.unverified'))}
        />
      </dl>
      {onConfigure && controllerId && (
        <Button onPress={() => onConfigure(controllerId)}>{t('commissioningUI.configure')}</Button>
      )}
    </div>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="wg:text-xs wg:text-muted">{label}</dt>
      <dd className="wg:font-medium">{value}</dd>
    </div>
  );
}

function CommissioningActions({ model }: { model: CommissioningModel }) {
  const { t } = useWagoTranslations();
  const {
    session,
    isLoading,
    hostKeyFingerprint,
    isolatedIdentity,
    sshUsername,
    sshPassword,
    confirmInstall,
    recoveryUsername,
    recoveryPassword,
    confirmRecovery,
    recoverSessionMutation,
    isCancelConfirmationOpen,
    setCancelConfirmationOpen,
    close,
    deliverSession,
    recoverSession,
    confirmHostKey,
  } = model;
  // Fallback keeps this hook call unconditional across renders where session becomes null.
  const verification = useCommissioningVerification(session ?? { id: -1, state: 'revoked' });
  if (session && verification.runtimeVerified === true) {
    return (
      <DrawerFooter>
        <Button variant="secondary" onPress={close}>
          {t('commissioningUI.close')}
        </Button>
      </DrawerFooter>
    );
  }
  return (
    <DrawerFooter className="wg:flex-wrap">
      {session && canRecover(session) && (
        <Button
          variant="danger"
          isPending={recoverSessionMutation.isPending}
          isDisabled={isLoading || !confirmRecovery || !recoveryUsername.trim() || !recoveryPassword}
          onPress={recoverSession}
        >
          {t('commissioningUI.cleanup')}
        </Button>
      )}
      <Button variant="secondary" onPress={isCancelConfirmationOpen ? () => setCancelConfirmationOpen(false) : close}>
        {t(isCancelConfirmationOpen ? 'commissioningUI.keep' : 'commissioningUI.close')}
      </Button>
      <CreateSessionActions model={model} />
      {session?.state === 'awaiting_identity_confirmation' && (
        <Button
          isPending={isLoading}
          isDisabled={!isolatedIdentity && (!hostKeyFingerprint || hostKeyFingerprint !== session.hostKeyFingerprint)}
          onPress={confirmHostKey}
        >
          {t(isLoading ? 'commissioningUI.confirmingIdentity' : 'commissioningUI.confirmKey')}
        </Button>
      )}
      {session && canInstall(session) && (
        <Button
          variant="danger"
          isPending={isLoading}
          isDisabled={isLoading || !confirmInstall || !sshUsername.trim() || !sshPassword}
          onPress={deliverSession}
        >
          {t(
            isLoading
              ? 'commissioningUI.starting'
              : session.state === 'delivery_failed'
                ? 'commissioningUI.retry'
                : 'commissioningUI.install',
          )}
        </Button>
      )}
      <CancelSessionAction model={model} />
    </DrawerFooter>
  );
}

function RecoveryFields({ model }: { model: CommissioningModel }) {
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
    confirmRecovery,
    setConfirmRecovery,
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
          <Checkbox
            isRequired
            isDisabled={isLoading}
            isSelected={confirmRecovery}
            onChange={setConfirmRecovery}
            name="confirm-recovery"
          >
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>{t('commissioningUI.approveCleanup')}</Checkbox.Content>
          </Checkbox>
        </div>
      )}
    </>
  );
}

function ConnectionFields({ model }: { model: CommissioningModel }) {
  const {
    session,
    isLoading,
    activeStep,
    name,
    setName,
    controllerIp,
    setControllerIp,
    mqttServerId,
    setMqttServerId,
    mqttServersQuery,
    setArtifactBusy,
    setSelectedArtifact,
  } = model;
  return (
    <>
      {!session && activeStep === 0 && <NameStep name={name} onNameChange={setName} />}
      {!session && activeStep === 1 && (
        <ConnectionStep
          controllerIp={controllerIp}
          mqttServerId={mqttServerId}
          mqttServersQuery={mqttServersQuery}
          onControllerIpChange={setControllerIp}
          onMqttServerIdChange={setMqttServerId}
        />
      )}
      {!session && activeStep === 2 && (
        <RuntimeArtifactImport
          disabled={isLoading}
          onBusyChange={setArtifactBusy}
          onSelectionChange={setSelectedArtifact}
        />
      )}
    </>
  );
}

function CreateSessionActions({ model }: { model: CommissioningModel }) {
  const { t } = useWagoTranslations();
  const {
    session,
    isLoading,
    activeStep,
    name,
    controllerIp,
    mqttServersQuery,
    setArtifactBusy,
    artifactBusy,
    artifactAvailable,
    selectedMqttServerId,
    setStep,
    createSession,
  } = model;
  return (
    <>
      {!session && activeStep === 0 && (
        <Button
          isDisabled={!name.trim()}
          onPress={() => {
            setArtifactBusy(true);
            setStep(1);
          }}
        >
          {t('commissioningUI.continue')}
        </Button>
      )}
      {!session && activeStep === 1 && (
        <Button
          isDisabled={
            !controllerIp.trim() ||
            selectedMqttServerId === null ||
            mqttServersQuery.isPending ||
            mqttServersQuery.isError
          }
          onPress={() => setStep(2)}
        >
          {t('commissioningUI.continue')}
        </Button>
      )}
      {!session && activeStep === 2 && (
        <Button variant="secondary" onPress={() => setStep(1)}>
          {t('commissioningUI.back')}
        </Button>
      )}
      {!session && activeStep === 2 && (
        <Button
          isPending={isLoading}
          isDisabled={
            artifactBusy ||
            !artifactAvailable ||
            !controllerIp.trim() ||
            selectedMqttServerId === null ||
            mqttServersQuery.isPending ||
            mqttServersQuery.isError
          }
          onPress={createSession}
        >
          {t(isLoading ? 'commissioningUI.preparing' : 'commissioningUI.scan')}
        </Button>
      )}
    </>
  );
}

function CancelSessionAction({ model }: { model: CommissioningModel }) {
  const { t } = useWagoTranslations();
  const { session, isLoading, removeSessionMutation, isCancelConfirmationOpen, setCancelConfirmationOpen, close } =
    model;
  return (
    <>
      {session &&
        session.state !== 'completed' &&
        (isCancelConfirmationOpen ? (
          <Button
            variant="danger"
            isPending={isLoading}
            onPress={() => removeSessionMutation.mutate(session.id, { onSuccess: close })}
          >
            {t(isLoading ? 'commissioningUI.removing' : 'commissioningUI.confirmCancel')}
          </Button>
        ) : (
          <Button variant="secondary" isDisabled={isLoading} onPress={() => setCancelConfirmationOpen(true)}>
            {t(session.state === 'revoked' ? 'commissioningUI.deleteRecord' : 'commissioningUI.cancel')}
          </Button>
        ))}
    </>
  );
}

function commissioningLoadingStatus(
  {
    recoverSessionMutation,
    createSessionMutation,
    removeSessionMutation,
    confirmHostKeyMutation,
  }: Pick<
    CommissioningModel,
    'recoverSessionMutation' | 'createSessionMutation' | 'removeSessionMutation' | 'confirmHostKeyMutation'
  >,
  t: TFunction,
): [string, string] | null {
  return recoverSessionMutation.isPending
    ? [t('commissioningUI.cleaning'), t('commissioningUI.cleaningDescription')]
    : createSessionMutation.isPending
      ? [t('commissioningUI.preparing'), t('commissioningUI.scanningDescription')]
      : removeSessionMutation.isPending
        ? [t('commissioningUI.canceling'), t('commissioningUI.cancelingDescription')]
        : confirmHostKeyMutation.isPending
          ? [t('commissioningUI.confirming'), t('commissioningUI.confirmingDescription')]
          : null;
}

function CommissioningErrors({ model }: { model: CommissioningModel }) {
  const {
    createSessionMutation,
    confirmHostKeyMutation,
    deliverSessionMutation,
    removeSessionMutation,
    recoverSessionMutation,
  } = model;
  return (
    <>
      {createSessionMutation.isError && <ErrorAlert error={createSessionMutation.error} />}
      {confirmHostKeyMutation.isError && <ErrorAlert error={confirmHostKeyMutation.error} />}
      {deliverSessionMutation.isError && <ErrorAlert error={deliverSessionMutation.error} />}
      {removeSessionMutation.isError && <ErrorAlert error={removeSessionMutation.error} />}
      {recoverSessionMutation.isError && <ErrorAlert error={recoverSessionMutation.error} />}
    </>
  );
}

function DevicePassport({ className, name, step }: { className?: string; name: string; step: number }) {
  const { t } = useWagoTranslations();
  return (
    <aside className={`wg:min-w-0 wg:rounded-large wg:bg-default-100 wg:p-5 ${className ?? ''}`}>
      <CpuIcon className="wg:h-10 wg:w-10 wg:text-primary" />
      <p className="wg:mt-4 wg:text-xs wg:font-semibold wg:uppercase wg:tracking-wider wg:text-muted">
        {t('commissioningUI.passport')}
      </p>
      <p className="wg:mt-1 wg:truncate wg:text-lg wg:font-semibold">{name}</p>
      <div className="wg:mt-5 wg:space-y-3">
        <PassportRow
          label={t('commissioningUI.identity')}
          value={t(step >= 3 ? 'commissioningUI.sessionStatus' : 'commissioningUI.notScanned')}
        />
        <PassportRow
          label={t('commissioningUI.runtime')}
          value={t(step >= 4 ? 'commissioningUI.sessionStatus' : 'commissioningUI.notInstalled')}
        />
        <PassportRow
          label={t('commissioningUI.claim')}
          value={t(step >= 5 ? 'commissioningUI.sessionStatus' : 'commissioningUI.pending')}
        />
      </div>
      <div className="wg:mt-6 wg:flex wg:gap-1">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <span
            key={index}
            className={`wg:h-1.5 wg:flex-1 wg:rounded-full ${index <= step ? 'wg:bg-primary' : 'wg:bg-default-300'}`}
          />
        ))}
      </div>
    </aside>
  );
}

function PassportRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="wg:text-xs wg:text-muted">{label}</p>
      <p className="wg:truncate wg:text-sm wg:font-medium">{value}</p>
    </div>
  );
}

function StepHeading({ step }: { step: number }) {
  const { t } = useWagoTranslations();
  return (
    <div>
      <p className="wg:text-sm wg:font-medium">{t('commissioningUI.step', { step: step + 1 })}</p>
      <h2 className="wg:mt-1 wg:text-xl wg:font-semibold">{t(`commissioningUI.steps.${step}.title`)}</h2>
      <p className="wg:mt-1 wg:text-sm wg:text-muted">{t(`commissioningUI.steps.${step}.description`)}</p>
    </div>
  );
}

function OperationStatus({ title, description }: { title: string; description: string }) {
  return (
    <div aria-live="polite" className="wg:rounded-large wg:border wg:border-primary/30 wg:bg-primary/5 wg:p-3">
      <div className="wg:flex wg:items-center wg:gap-2">
        <Spinner color="accent" size="sm" />
        <p className="wg:text-sm wg:font-medium">{title}</p>
      </div>
      <p className="wg:mt-1 wg:text-xs wg:text-muted">{description}</p>
      <div className="wg:mt-3 wg:h-1 wg:overflow-hidden wg:rounded-full wg:bg-default-200">
        <div className="wg:h-full wg:w-2/5 wg:animate-pulse wg:rounded-full wg:bg-primary" />
      </div>
    </div>
  );
}

function NameStep({ name, onNameChange }: { name: string; onNameChange: (name: string) => void }) {
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

function ConnectionStep({
  controllerIp,
  mqttServerId,
  mqttServersQuery,
  onControllerIpChange,
  onMqttServerIdChange,
}: {
  controllerIp: string;
  mqttServerId: Key | null;
  mqttServersQuery: ReturnType<typeof useMqttServersQuery>;
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
      ) : (
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
      )}
    </div>
  );
}

function HostKeyConfirmationStep({
  fingerprint,
  expectedFingerprint,
  onFingerprintChange,
}: {
  fingerprint: string;
  expectedFingerprint: string;
  onFingerprintChange: (value: string) => void;
}) {
  const { t } = useWagoTranslations();
  return (
    <div className="wg:space-y-4">
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{t('commissioningUI.reviewKey')}</Alert.Title>
          <Alert.Description>{t('commissioningUI.reviewKeyDescription')}</Alert.Description>
        </Alert.Content>
      </Alert>
      <p className="wg:break-all wg:text-sm">{t('commissioningUI.scannedKey', { fingerprint: expectedFingerprint })}</p>
      <TextField isRequired name="host-key-fingerprint">
        <Label>{t('commissioningUI.reviewedKey')}</Label>
        <Input value={fingerprint} onChange={(event) => onFingerprintChange(event.target.value)} />
      </TextField>
    </div>
  );
}

function canInstall(session: CommissioningSession) {
  return ['awaiting_delivery', 'delivery_failed', 'awaiting_codesys_confirmation'].includes(session.state);
}

function canRecover(session: CommissioningSession) {
  return session.runtimeRecoveryAvailable === true;
}

function CredentialFields({
  intent = 'installation',
  isDisabled,
  username,
  password,
  onUsernameChange,
  onPasswordChange,
  custom,
  onCustomChange,
}: {
  intent?: 'installation' | 'recovery';
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
          account: t(custom ? 'commissioningUI.custom' : 'commissioningUI.defaultAccount'),
        })}
      </p>
      <Checkbox isSelected={custom} isDisabled={isDisabled} onChange={onCustomChange}>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Checkbox.Content>{t('commissioningUI.advanced')}</Checkbox.Content>
      </Checkbox>
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

function DeliveryStep({
  isDelivering,
  session,
  sshUsername,
  sshPassword,
  onSshUsernameChange,
  onSshPasswordChange,
  customSsh,
  onCustomSshChange,
  confirmInstall,
  onConfirmInstallChange,
}: {
  isDelivering: boolean;
  session: CommissioningSession;
  sshUsername: string;
  sshPassword: string;
  onSshUsernameChange: (value: string) => void;
  onSshPasswordChange: (value: string) => void;
  customSsh: boolean;
  onCustomSshChange: (value: boolean) => void;
  confirmInstall: boolean;
  onConfirmInstallChange: (value: boolean) => void;
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
          <Checkbox
            isRequired
            isDisabled={isDelivering}
            isSelected={confirmInstall}
            onChange={onConfirmInstallChange}
            name="confirm-install"
          >
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>{t('commissioningUI.approveInstall')}</Checkbox.Content>
          </Checkbox>
          <p className="wg:text-sm wg:text-muted">{t('commissioningUI.attemptApproval')}</p>
        </>
      )}
    </div>
  );
}

function ProgressStep({ name, session }: { name: string; session: CommissioningSession }) {
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
      <DevicePassport className="wg:md:hidden" name={name} step={5} />
      <CommissioningStatusPanel isActive={!complete} session={progress} />
      <div className="wg:rounded-large wg:border wg:border-default-200 wg:p-4 wg:text-sm">
        <p className="wg:font-medium">{t('commissioningUI.safeToClose')}</p>
        <p className="wg:mt-1 wg:text-muted">{t('commissioningUI.savedDescription')}</p>
      </div>
      {session.failureReason && (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{tBackendMessage(session.failureReason)}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </div>
  );
}

function VerificationStatus({
  session,
  onConfigure,
}: {
  session: CommissioningSession;
  onConfigure?: (controllerId: number) => void;
}) {
  const { t, tBackendMessage } = useWagoTranslations();
  const verification = useCommissioningVerification(session);
  const controllerId = verification.data?.controllerId;
  const managementControllerId = controllerId ?? session.managementControllerId;
  return (
    <div className="wg:space-y-3">
      <Alert status={verification.enrollmentComplete ? 'success' : 'warning'}>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>
            {t(verification.enrollmentComplete ? 'commissioningUI.enrolled' : 'commissioningUI.verifying')}
          </Alert.Title>
          <Alert.Description>
            {verification.unavailable ? (
              t('commissioningUI.verificationUnavailable')
            ) : verification.data ? (
              <ul>
                <li>
                  {t('commissioningUI.heartbeat', {
                    status: t(
                      verification.data.permanentConnection ? 'commissioningUI.received' : 'commissioningUI.pending',
                    ),
                  })}
                </li>
                <li>
                  {t('commissioningUI.credentialRevoked', {
                    status: t(
                      verification.data.enrollmentRevoked ? 'commissioningUI.verified' : 'commissioningUI.pending',
                    ),
                  })}
                </li>
              </ul>
            ) : (
              t('commissioningUI.checkingEvidence')
            )}
          </Alert.Description>
        </Alert.Content>
      </Alert>
      {verification.data && (
        <section aria-label={t('commissioningUI.qualification')}>
          <h3>
            {t(verification.runtimeVerified ? 'commissioningUI.configurationVerified' : 'commissioningUI.setupChecks')}
          </h3>
          <ul>
            <li>
              {t('commissioningUI.configuration', {
                status: t(
                  verification.data.configurationApplied ? 'commissioningUI.applied' : 'commissioningUI.pending',
                ),
              })}
            </li>
            <li>
              {t('commissioningUI.hardwareProbe', {
                status: tBackendMessage(verification.data.hardwareReadiness ?? t('commissioningUI.unverified')),
              })}
            </li>
            <li>
              {t('commissioningUI.managementStatus', {
                status: tBackendMessage(verification.data.managementHardening),
              })}
            </li>
            <li>{t('commissioningUI.physicalQualification')}</li>
          </ul>
        </section>
      )}
      {managementControllerId && (
        <>
          {onConfigure && controllerId && (
            <Button onPress={() => onConfigure(controllerId)}>{t('commissioningUI.configure')}</Button>
          )}
          <CommissioningSecurityPanel key={session.id} sessionId={session.id} controllerId={managementControllerId} />
        </>
      )}
    </div>
  );
}

function CommissioningStatusPanel({ isActive, session }: { isActive: boolean; session: CommissioningSession }) {
  const { t, tBackendMessage } = useWagoTranslations();
  const percent = session.progressPercent ?? 0;
  const isQueued = session.state === 'awaiting_delivery';
  const hasFailure = !isActive && Boolean(session.failureReason);
  const title = isQueued
    ? t('commissioningUI.approvalRequired')
    : (session.progressStep ?? (isActive ? t('commissioningUI.preparing') : commissioningLabel(session.state, t)));
  const detail = isQueued
    ? t('commissioningUI.approvalDescription')
    : (session.progressDetail ?? t('commissioningUI.waiting'));
  return (
    <div aria-live="polite" className="wg:rounded-large wg:border wg:border-primary/30 wg:bg-primary/5 wg:p-4">
      <div className="wg:flex wg:items-start wg:gap-3">
        {isActive ? (
          <Spinner color="accent" size="sm" />
        ) : hasFailure ? (
          <AlertCircleIcon className="wg:h-6 wg:w-6 wg:shrink-0 wg:text-danger" />
        ) : isQueued ? (
          <CpuIcon className="wg:h-6 wg:w-6 wg:shrink-0 wg:text-muted" />
        ) : (
          <CheckCircle2Icon className="wg:h-6 wg:w-6 wg:shrink-0 wg:text-success" />
        )}
        <div className="wg:min-w-0 wg:flex-1">
          <div className="wg:flex wg:items-center wg:justify-between wg:gap-3">
            <p className="wg:font-medium">{tBackendMessage(title)}</p>
            <span className="wg:text-sm wg:text-muted">{percent}%</span>
          </div>
          <p className="wg:mt-1 wg:text-sm wg:text-muted">{tBackendMessage(detail)}</p>
          <div className="wg:mt-3 wg:h-1.5 wg:overflow-hidden wg:rounded-full wg:bg-default-200">
            <div
              className={`wg:h-full wg:rounded-full wg:transition-[width] wg:duration-500 ${hasFailure ? 'wg:bg-danger' : 'wg:bg-primary'}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>
      {hasFailure && (
        <Alert className="wg:mt-4" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t('commissioningUI.deliveryError')}</Alert.Title>
            <Alert.Description>{tBackendMessage(session.failureReason)}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <ActivityLog auditLog={session.auditLog} />
    </div>
  );
}

function ActivityLog({ auditLog }: { auditLog: string }) {
  const { t, language } = useWagoTranslations();
  const events = parseActivityLog(auditLog);
  if (!events.length) return null;
  return (
    <div className="wg:mt-4 wg:border-t wg:border-default-200 wg:pt-3">
      <p className="wg:text-xs wg:font-semibold wg:uppercase wg:tracking-wider wg:text-muted">
        {t('commissioningUI.activity')}
      </p>
      <ol className="wg:mt-2 wg:space-y-1">
        {events.map((event) => (
          <li key={`${event.at}-${event.event}`} className="wg:text-xs wg:text-muted">
            <span className="wg:text-foreground">{formatActivity(event.event)}</span>{' '}
            <span>{new Date(event.at).toLocaleTimeString(language)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function formatActivity(event: string): string {
  return event.replace(/^progress: /, '').replaceAll('_', ' ');
}

function parseActivityLog(auditLog: string): Array<{ at: string; event: string }> {
  try {
    const entries = JSON.parse(auditLog) as Array<{ at?: unknown; event?: unknown }>;
    return entries
      .filter(
        (entry): entry is { at: string; event: string } =>
          typeof entry.at === 'string' && typeof entry.event === 'string',
      )
      .slice(-5);
  } catch {
    return [];
  }
}

function sessionStep(session: CommissioningSession | null): number {
  if (!session) return 0;
  if (session.state === 'awaiting_identity_confirmation') return 3;
  return ['awaiting_delivery', 'delivering', 'awaiting_codesys_confirmation', 'delivery_failed'].includes(session.state)
    ? 4
    : 5;
}

function ErrorAlert({ error }: { error: unknown }) {
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
