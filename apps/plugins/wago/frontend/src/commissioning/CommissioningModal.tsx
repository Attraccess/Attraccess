import { Alert, Button, DrawerBody, DrawerFooter, DrawerHeader, DrawerHeading, Key } from '@heroui/react';
import { useEffect, useState } from 'react';
import { CommissioningSession } from '../api/client';
import {
  useCommissioningSessionsQuery,
  useConfirmCommissioningHostKeyMutation,
  useCreateCommissioningSessionMutation,
  useDeliverCommissioningSessionMutation,
  useMqttServersQuery,
  useRecoverCommissioningSessionMutation,
  useRemoveCommissioningSessionMutation,
  useSettingsQuery,
} from '../api/queries';
import { RuntimeUpdateDetails } from '../controllers/Table';
import { useWagoTranslations } from '../i18n';
import { StandardDrawer } from '../shared/drawer';
import { RuntimeArtifactInfo } from './BundledRuntime';
import { CancelSessionAction } from './CancelSessionAction';
import { CommissioningErrors } from './CommissioningErrors';
import { CommissioningLiveStatus } from './CommissioningLiveStatus';
import { commissioningLoadingStatus } from './commissioningLoadingStatus';
import { ActivityLog } from './Status';
import { canInstall } from './model';
import { canRecover } from './model';
import { CommissioningModalProps } from './model';
import { CompletedSessionSummary } from './Status';
import { DEFAULT_SSH } from './model';
import { DeliveryStep } from './Steps';
import { HostKeyConfirmationStep } from './Steps';
import { latestCommissioningSession } from './model';
import { OperationStatus } from './Status';
import { ProgressStep } from './Steps';
import { sessionStep } from './Steps';
import { StepHeading } from './Steps';
import { VerificationStatus } from './Status';
import { CommissioningPlatformPreflight } from './CommissioningPlatformPreflight';
import { ConnectionFields } from './ConnectionFields';
import { CreateSessionActions } from './CreateSessionActions';
import { RecoveryFields } from './RecoveryFields';
import { useCommissioningVerification } from './useCommissioningVerification';

export function useCommissioningInputs({
  isOpen,
  session: resumedSession,
  onOpenChange,
  onConfigure,
}: CommissioningModalProps) {
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
  const artifactAvailable = selectedArtifact !== null;
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [controllerIp, setControllerIp] = useState('');
  const [mqttServerId, setMqttServerId] = useState<Key | null>(null);
  const [hostKeyFingerprint, setHostKeyFingerprint] = useState('');
  const [sshUsername, setSshUsername] = useState(DEFAULT_SSH.username);
  const [sshPassword, setSshPassword] = useState(DEFAULT_SSH.password);
  const [customSsh, setCustomSsh] = useState(false);
  const [recoveryUsername, setRecoveryUsername] = useState(DEFAULT_SSH.username);
  const [recoveryPassword, setRecoveryPassword] = useState(DEFAULT_SSH.password);
  const [customRecoverySsh, setCustomRecoverySsh] = useState(false);
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
    ? latestCommissioningSession(
        commissioningSessionsQuery.data?.find((candidate) => candidate.id === mutationSession.id),
        mutationSession,
      )
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
    setRecoveryUsername(DEFAULT_SSH.username);
    setRecoveryPassword(DEFAULT_SSH.password);
    setCustomRecoverySsh(false);
    setHostKeyFingerprint('');
  }, [isOpen, resumedSession?.id]);

  useEffect(() => {
    if (!isOpen) return;
    setMqttServerId(resumedSession?.mqttServerId.toString() ?? null);
    setName(resumedSession?.controllerName ?? '');
    setControllerIp(resumedSession?.targetHost ?? '');
    setStep(sessionStep(resumedSession));
  }, [isOpen, resumedSession]);

  useEffect(() => {
    if (!isOpen || mqttServerId !== null) return;
    const servers = mqttServersQuery.data ?? [];
    const defaultServer = servers.find((server) => server.id === settingsQuery.data?.defaultMqttServerId);
    const selected = defaultServer ?? (servers.length === 1 ? servers[0] : null);
    if (selected) setMqttServerId(selected.id.toString());
  }, [isOpen, mqttServerId, mqttServersQuery.data, settingsQuery.data?.defaultMqttServerId]);
  return {
    t,
    createSessionMutation,
    confirmHostKeyMutation,
    deliverSessionMutation,
    recoverSessionMutation,
    removeSessionMutation,
    settingsQuery,
    mqttServersQuery,
    commissioningSessionsQuery,
    createdSession,
    setCreatedSession,
    artifactBusy,
    setArtifactBusy,
    selectedArtifact,
    setSelectedArtifact,
    artifactAvailable,
    step,
    setStep,
    name,
    setName,
    controllerIp,
    setControllerIp,
    mqttServerId,
    setMqttServerId,
    hostKeyFingerprint,
    setHostKeyFingerprint,
    sshUsername,
    setSshUsername,
    sshPassword,
    setSshPassword,
    customSsh,
    setCustomSsh,
    recoveryUsername,
    setRecoveryUsername,
    recoveryPassword,
    setRecoveryPassword,
    customRecoverySsh,
    setCustomRecoverySsh,
    isCancelConfirmationOpen,
    setCancelConfirmationOpen,
    attemptSession,
    mutationSession,
    session,
    selectedMqttServerId,
    isLoading,
    loadingStatus,
    isOpen,
    resumedSession,
    onOpenChange,
    onConfigure,
  } as const;
}

export function useCommissioningClose(model: ReturnType<typeof useCommissioningInputs>) {
  function close() {
    model.setCreatedSession(null);
    model.setStep(0);
    model.setName('');
    model.setControllerIp('');
    model.setMqttServerId(null);
    model.setHostKeyFingerprint('');
    model.setSshUsername(DEFAULT_SSH.username);
    model.setSshPassword(DEFAULT_SSH.password);
    model.setCustomSsh(false);
    model.setCancelConfirmationOpen(false);
    model.setRecoveryUsername(DEFAULT_SSH.username);
    model.setRecoveryPassword(DEFAULT_SSH.password);
    model.setCustomRecoverySsh(false);
    model.createSessionMutation.reset();
    model.confirmHostKeyMutation.reset();
    model.deliverSessionMutation.reset();
    model.recoverSessionMutation.reset();
    model.removeSessionMutation.reset();
    model.onOpenChange(false);
  }

  function createSession() {
    if (
      model.isLoading ||
      model.artifactBusy ||
      !model.artifactAvailable ||
      !model.name.trim() ||
      !model.controllerIp.trim()
    )
      return;
    if (model.selectedMqttServerId === null) return;
    model.createSessionMutation.mutate(
      {
        name: model.name.trim(),
        targetHost: model.controllerIp.trim(),
        mqttServerId: model.selectedMqttServerId,
      },
      {
        onSuccess: (created) => {
          model.setCreatedSession(created);
          model.setStep(2);
        },
      },
    );
  }

  function deliverSession() {
    if (
      !model.session ||
      model.isLoading ||
      !model.sshUsername.trim() ||
      !model.sshPassword ||
      !canInstall(model.session)
    )
      return;
    model.deliverSessionMutation.mutate({
      id: model.session.id,
      confirmInstall: true,
      temporarySsh: { username: model.sshUsername.trim(), password: model.sshPassword },
    });
    if (model.customSsh) model.setSshPassword('');
    if (model.customRecoverySsh) model.setRecoveryPassword('');
  }

  function recoverSession() {
    if (
      !model.session ||
      model.isLoading ||
      !canRecover(model.session) ||
      !model.recoveryUsername.trim() ||
      !model.recoveryPassword
    )
      return;
    model.recoverSessionMutation.mutate({
      id: model.session.id,
      confirmInstall: true,
      temporarySsh: { username: model.recoveryUsername.trim(), password: model.recoveryPassword },
    });
    if (model.customRecoverySsh) model.setRecoveryPassword('');
    if (model.customSsh) model.setSshPassword('');
  }

  function confirmHostKey(physicalIdentityConfirmed = false) {
    if (!model.session) return;
    model.confirmHostKeyMutation.mutate({
      id: model.session.id,
      hostKeyFingerprint: physicalIdentityConfirmed ? model.session.hostKeyFingerprint : model.hostKeyFingerprint,
      physicalIdentityConfirmed,
    });
  }

  function configureController(controllerId: number) {
    close();
    model.onConfigure?.(controllerId);
  }

  const activeStep = model.session ? sessionStep(model.session) : model.step;
  const title = model.session?.controllerName || model.name || model.t('commissioningUI.newController');
  return {
    ...model,
    close,
    createSession,
    deliverSession,
    recoverSession,
    confirmHostKey,
    configureController,
    activeStep,
    title,
  } as const;
}

export function useCommissioningOutput(model: ReturnType<typeof useCommissioningClose>) {
  return {
    isOpen: model.isOpen,
    onConfigure: model.onConfigure,
    session: model.session,
    commissioningSessionsQuery: model.commissioningSessionsQuery,
    isLoading: model.isLoading,
    activeStep: model.activeStep,
    title: model.title,
    loadingStatus: model.loadingStatus,
    name: model.name,
    setName: model.setName,
    controllerIp: model.controllerIp,
    setControllerIp: model.setControllerIp,
    mqttServerId: model.mqttServerId,
    setMqttServerId: model.setMqttServerId,
    mqttServersQuery: model.mqttServersQuery,
    setArtifactBusy: model.setArtifactBusy,
    artifactBusy: model.artifactBusy,
    artifactAvailable: model.artifactAvailable,
    selectedMqttServerId: model.selectedMqttServerId,
    setSelectedArtifact: model.setSelectedArtifact,
    hostKeyFingerprint: model.hostKeyFingerprint,
    setHostKeyFingerprint: model.setHostKeyFingerprint,
    deliverSessionMutation: model.deliverSessionMutation,
    sshUsername: model.sshUsername,
    sshPassword: model.sshPassword,
    setSshUsername: model.setSshUsername,
    setSshPassword: model.setSshPassword,
    customSsh: model.customSsh,
    setCustomSsh: model.setCustomSsh,
    recoveryUsername: model.recoveryUsername,
    recoveryPassword: model.recoveryPassword,
    setRecoveryUsername: model.setRecoveryUsername,
    setRecoveryPassword: model.setRecoveryPassword,
    customRecoverySsh: model.customRecoverySsh,
    setCustomRecoverySsh: model.setCustomRecoverySsh,
    createSessionMutation: model.createSessionMutation,
    confirmHostKeyMutation: model.confirmHostKeyMutation,
    removeSessionMutation: model.removeSessionMutation,
    recoverSessionMutation: model.recoverSessionMutation,
    isCancelConfirmationOpen: model.isCancelConfirmationOpen,
    setCancelConfirmationOpen: model.setCancelConfirmationOpen,
    setStep: model.setStep,
    close: model.close,
    createSession: model.createSession,
    deliverSession: model.deliverSession,
    recoverSession: model.recoverSession,
    confirmHostKey: model.confirmHostKey,
    configureController: model.configureController,
  };
}

export function CommissioningContent({ model }: { model: CommissioningModel }) {
  const { t } = useWagoTranslations();
  const {
    onConfigure,
    session,
    activeStep,
    title,
    loadingStatus,
    hostKeyFingerprint,
    setHostKeyFingerprint,
    deliverSessionMutation,
    sshUsername,
    sshPassword,
    setSshUsername,
    setSshPassword,
    customSsh,
    setCustomSsh,
    isCancelConfirmationOpen,
    configureController,
  } = model;
  // Fallback keeps this hook call unconditional across renders where session becomes null.
  const verification = useCommissioningVerification(session ?? { id: -1, state: 'revoked' });
  const isFullyDone = !!session && verification.runtimeVerified === true;
  return (
    <DrawerBody>
      <div>
        <div className="wg:min-w-0 wg:space-y-5">
          {session && isFullyDone ? (
            <CompletedSessionSummary
              session={session}
              verification={verification}
              onConfigure={onConfigure ? configureController : undefined}
            />
          ) : (
            <>
              <StepHeading
                step={activeStep}
                identity={session?.state === 'awaiting_identity_confirmation'}
                failed={Boolean(session?.failureReason)}
              />
              {session && <CommissioningLiveStatus model={model} />}
              {loadingStatus && <OperationStatus title={loadingStatus[0]} description={loadingStatus[1]} />}
              <ConnectionFields model={model} />
              {session?.state === 'awaiting_identity_confirmation' && (
                <HostKeyConfirmationStep
                  fingerprint={hostKeyFingerprint}
                  expectedFingerprint={session.hostKeyFingerprint}
                  onFingerprintChange={setHostKeyFingerprint}
                  onConfirm={() => model.confirmHostKey()}
                />
              )}
              {session && activeStep === 2 && session.state !== 'awaiting_identity_confirmation' && (
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
                />
              )}
              {session && activeStep === 3 && <ProgressStep name={title} session={session} />}
              {session && (session.platformReport || session.dockerProvisionState || canInstall(session)) && (
                <details>
                  <summary>{t('commissioningUI.diagnostics')}</summary>
                  <CommissioningPlatformPreflight
                    key={`preflight-${session.id}`}
                    session={session}
                    showFailure={false}
                  />
                  <ActivityLog auditLog={session.auditLog} />
                </details>
              )}
              {session?.managedAccessAvailable && session.failureReason && (
                <details>
                  <summary>{t('runtimeManagement.recoveryTitle')}</summary>
                  <RuntimeUpdateDetails target={{ session }} />
                </details>
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

export function CommissioningActions({ model }: { model: CommissioningModel }) {
  const { t } = useWagoTranslations();
  const {
    session,
    isLoading,
    sshUsername,
    sshPassword,
    recoveryUsername,
    recoveryPassword,
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
          isDisabled={isLoading || !recoveryUsername.trim() || !recoveryPassword}
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
        <Button isPending={isLoading} onPress={() => confirmHostKey(true)}>
          {t('commissioningUI.useController')}
        </Button>
      )}
      {session && canInstall(session) && (
        <Button
          variant="danger"
          isPending={isLoading}
          isDisabled={isLoading || !sshUsername.trim() || !sshPassword}
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

function useCommissioning({ isOpen, session: resumedSession, onOpenChange, onConfigure }: CommissioningModalProps) {
  const useCommissioningInputsModel = useCommissioningInputs({
    isOpen,
    session: resumedSession,
    onOpenChange,
    onConfigure,
  });
  const useCommissioningCloseModel = useCommissioningClose(useCommissioningInputsModel);
  return useCommissioningOutput(useCommissioningCloseModel);
}

export type CommissioningModel = ReturnType<typeof useCommissioning>;

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
        <DrawerHeading className="wg:text-xl wg:font-semibold">{t('commissioningUI.title')}</DrawerHeading>
      </DrawerHeader>
      <CommissioningContent model={model} />
      <CommissioningActions model={model} />
    </StandardDrawer>
  );
}
