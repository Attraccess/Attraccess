import { commissioningLoadingStatus } from './CommissioningModal.commissioning-live-status.helpers';
import type { Key } from '@heroui/react';
import { useEffect, useState } from 'react';
import type { CommissioningSession } from './api';
import type { RuntimeArtifactInfo } from './BundledRuntime';
import { useWagoTranslations } from './i18n';
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
import { CommissioningModalProps } from './CommissioningModal.contracts';
import { DEFAULT_SSH } from './CommissioningModal.state';
import { latestCommissioningSession } from './CommissioningModal.error-alert.helpers';
import { sessionStep } from './CommissioningModal.recovery-fields.helpers';

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
