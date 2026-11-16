import type { Key } from '@heroui/react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { CommissioningSession, MqttServer } from '../api/client';
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
import { useWagoTranslations } from '../i18n';
import type { RuntimeArtifactInfo } from './artifacts/BundledRuntime';
import { canInstall, canRecover, DEFAULT_SSH, latestCommissioningSession, sessionStep } from './model';
import type { CommissioningModalProps } from './model';
import { commissioningLoadingStatus } from './status/commissioningLoadingStatus';

/** Wizard state shared by the drawer body (CommissioningContent) and its footer (CommissioningActions). */
export interface CommissioningState {
  onConfigure: ((controllerId: number) => void) | undefined;
  session: CommissioningSession | null;
  sessionsQuery: UseQueryResult<CommissioningSession[]>;
  mqttServersQuery: UseQueryResult<MqttServer[]>;
  activeStep: number;
  isLoading: boolean;
  loadingStatus: [string, string] | null;
  errorMessages: string[];
  deliverPending: boolean;
  recoverPending: boolean;
  name: string;
  setName: (name: string) => void;
  controllerIp: string;
  setControllerIp: (controllerIp: string) => void;
  mqttServerId: Key | null;
  setMqttServerId: (mqttServerId: Key | null) => void;
  selectedMqttServerId: number | null;
  artifactBusy: boolean;
  artifactAvailable: boolean;
  setArtifactBusy: (busy: boolean) => void;
  setSelectedArtifact: (artifact: RuntimeArtifactInfo | null) => void;
  hostKeyFingerprint: string;
  setHostKeyFingerprint: (fingerprint: string) => void;
  sshUsername: string;
  setSshUsername: (username: string) => void;
  sshPassword: string;
  setSshPassword: (password: string) => void;
  customSsh: boolean;
  setCustomSsh: (custom: boolean) => void;
  recoveryUsername: string;
  setRecoveryUsername: (username: string) => void;
  recoveryPassword: string;
  setRecoveryPassword: (password: string) => void;
  customRecoverySsh: boolean;
  setCustomRecoverySsh: (custom: boolean) => void;
  isCancelConfirmationOpen: boolean;
  setCancelConfirmationOpen: (open: boolean) => void;
  setStep: (step: number) => void;
  close: () => void;
  createSession: () => void;
  deliverSession: () => void;
  recoverSession: () => void;
  confirmHostKey: (physicalIdentityConfirmed?: boolean) => void;
  removeSession: (id: number) => void;
  configureController: (controllerId: number) => void;
}

export function useCommissioningState({
  isOpen,
  session: resumedSession,
  onOpenChange,
  onConfigure,
}: CommissioningModalProps): CommissioningState {
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
      recovering: recoverSessionMutation.isPending,
      creating: createSessionMutation.isPending,
      removing: removeSessionMutation.isPending,
      confirming: confirmHostKeyMutation.isPending,
    },
    t,
  );
  const errorMessages = [
    createSessionMutation,
    confirmHostKeyMutation,
    deliverSessionMutation,
    removeSessionMutation,
    recoverSessionMutation,
  ].flatMap((mutation) =>
    mutation.isError ? [mutation.error instanceof Error ? mutation.error.message : t('common.retry')] : [],
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
    setCancelConfirmationOpen(false);
    setRecoveryUsername(DEFAULT_SSH.username);
    setRecoveryPassword(DEFAULT_SSH.password);
    setCustomRecoverySsh(false);
    createSessionMutation.reset();
    confirmHostKeyMutation.reset();
    deliverSessionMutation.reset();
    recoverSessionMutation.reset();
    removeSessionMutation.reset();
    onOpenChange(false);
  }

  function createSession() {
    if (isLoading || artifactBusy || !artifactAvailable || !name.trim() || !controllerIp.trim()) return;
    if (selectedMqttServerId === null) return;
    createSessionMutation.mutate(
      {
        name: name.trim(),
        targetHost: controllerIp.trim(),
        mqttServerId: selectedMqttServerId,
      },
      {
        onSuccess: (created) => {
          setCreatedSession(created);
          setStep(2);
        },
      },
    );
  }

  function deliverSession() {
    if (!session || isLoading || !sshUsername.trim() || !sshPassword || !canInstall(session)) return;
    deliverSessionMutation.mutate({
      id: session.id,
      confirmInstall: true,
      temporarySsh: { username: sshUsername.trim(), password: sshPassword },
    });
    if (customSsh) setSshPassword('');
    if (customRecoverySsh) setRecoveryPassword('');
  }

  function recoverSession() {
    if (!session || isLoading || !canRecover(session) || !recoveryUsername.trim() || !recoveryPassword) return;
    recoverSessionMutation.mutate({
      id: session.id,
      confirmInstall: true,
      temporarySsh: { username: recoveryUsername.trim(), password: recoveryPassword },
    });
    if (customRecoverySsh) setRecoveryPassword('');
    if (customSsh) setSshPassword('');
  }

  function confirmHostKey(physicalIdentityConfirmed = false) {
    if (!session) return;
    confirmHostKeyMutation.mutate({
      id: session.id,
      hostKeyFingerprint: physicalIdentityConfirmed ? session.hostKeyFingerprint : hostKeyFingerprint,
      physicalIdentityConfirmed,
    });
  }

  function removeSession(id: number) {
    removeSessionMutation.mutate(id, { onSuccess: close });
  }

  function configureController(controllerId: number) {
    close();
    onConfigure?.(controllerId);
  }

  const activeStep = session ? sessionStep(session) : step;
  return {
    onConfigure,
    session,
    sessionsQuery: commissioningSessionsQuery,
    mqttServersQuery,
    activeStep,
    isLoading,
    loadingStatus,
    errorMessages,
    deliverPending: deliverSessionMutation.isPending,
    recoverPending: recoverSessionMutation.isPending,
    name,
    setName,
    controllerIp,
    setControllerIp,
    mqttServerId,
    setMqttServerId,
    selectedMqttServerId,
    artifactBusy,
    artifactAvailable,
    setArtifactBusy,
    setSelectedArtifact,
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
    setStep,
    close,
    createSession,
    deliverSession,
    recoverSession,
    confirmHostKey,
    removeSession,
    configureController,
  };
}
