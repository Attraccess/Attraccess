import type { Key } from '@heroui/react';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { CommissioningSession } from '../api/client';
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
import { canInstall, canRecover, latestCommissioningSession, sessionStep, sshCredentials } from './model';
import type { CommissioningModalProps, SshCredentials } from './model';

export interface CommissioningForm {
  name: string;
  controllerIp: string;
  mqttServerId: Key | null;
}

export interface CommissioningPending {
  any: boolean;
  creating: boolean;
  confirming: boolean;
  delivering: boolean;
  recovering: boolean;
  removing: boolean;
}

export interface CommissioningState {
  session: CommissioningSession | null;
  activeStep: number;
  setStep: (step: number) => void;
  form: CommissioningForm;
  updateForm: (patch: Partial<CommissioningForm>) => void;
  delivery: SshCredentials;
  setDelivery: Dispatch<SetStateAction<SshCredentials>>;
  recovery: SshCredentials;
  setRecovery: Dispatch<SetStateAction<SshCredentials>>;
  artifactReady: boolean;
  setArtifactBusy: (busy: boolean) => void;
  setSelectedArtifact: (artifact: RuntimeArtifactInfo | null) => void;
  isCancelConfirmationOpen: boolean;
  setCancelConfirmationOpen: (open: boolean) => void;
  pending: CommissioningPending;
  errorMessages: string[];
  close: () => void;
  createSession: () => void;
  deliverSession: () => void;
  recoverSession: () => void;
  confirmHostKey: (hostKeyFingerprint: string, physicalIdentityConfirmed?: boolean) => void;
  removeSession: (id: number) => void;
}

const EMPTY_FORM: CommissioningForm = { name: '', controllerIp: '', mqttServerId: null };

/** Wizard state shared by CommissioningModal's drawer body and footer: both render the same session, step, inputs and pending operation. */
export function useCommissioningState({
  isOpen,
  session: resumedSession,
  onOpenChange,
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
  const artifactReady = !artifactBusy && selectedArtifact !== null;
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CommissioningForm>(EMPTY_FORM);
  const [delivery, setDelivery] = useState(() => sshCredentials(false));
  const [recovery, setRecovery] = useState(() => sshCredentials(false));
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
  const mutations = [
    createSessionMutation,
    confirmHostKeyMutation,
    deliverSessionMutation,
    removeSessionMutation,
    recoverSessionMutation,
  ];
  const pending: CommissioningPending = {
    any: mutations.some((mutation) => mutation.isPending),
    creating: createSessionMutation.isPending,
    confirming: confirmHostKeyMutation.isPending,
    delivering: deliverSessionMutation.isPending,
    recovering: recoverSessionMutation.isPending,
    removing: removeSessionMutation.isPending,
  };
  const errorMessages = mutations.flatMap((mutation) =>
    mutation.isError ? [mutation.error instanceof Error ? mutation.error.message : t('common.retry')] : [],
  );

  useEffect(() => {
    setDelivery(sshCredentials(false));
    setRecovery(sshCredentials(false));
  }, [isOpen, resumedSession?.id]);

  useEffect(() => {
    if (!isOpen) return;
    setForm({
      name: resumedSession?.controllerName ?? '',
      controllerIp: resumedSession?.targetHost ?? '',
      mqttServerId: resumedSession?.mqttServerId.toString() ?? null,
    });
    setStep(sessionStep(resumedSession));
  }, [isOpen, resumedSession]);

  useEffect(() => {
    if (!isOpen || form.mqttServerId !== null) return;
    const servers = mqttServersQuery.data ?? [];
    const defaultServer = servers.find((server) => server.id === settingsQuery.data?.defaultMqttServerId);
    const selected = defaultServer ?? (servers.length === 1 ? servers[0] : null);
    if (selected) setForm((current) => ({ ...current, mqttServerId: selected.id.toString() }));
  }, [isOpen, form.mqttServerId, mqttServersQuery.data, settingsQuery.data?.defaultMqttServerId]);

  function close() {
    setCreatedSession(null);
    setStep(0);
    setForm(EMPTY_FORM);
    setDelivery(sshCredentials(false));
    setRecovery(sshCredentials(false));
    setCancelConfirmationOpen(false);
    mutations.forEach((mutation) => mutation.reset());
    onOpenChange(false);
  }

  function clearCustomPasswords() {
    setDelivery((current) => (current.custom ? { ...current, password: '' } : current));
    setRecovery((current) => (current.custom ? { ...current, password: '' } : current));
  }

  function createSession() {
    const name = form.name.trim();
    const targetHost = form.controllerIp.trim();
    if (pending.any || !artifactReady || !name || !targetHost || form.mqttServerId === null) return;
    createSessionMutation.mutate(
      { name, targetHost, mqttServerId: Number(form.mqttServerId) },
      {
        onSuccess: (created) => {
          setCreatedSession(created);
          setStep(2);
        },
      },
    );
  }

  function deliverSession() {
    if (!session || pending.any || !delivery.username.trim() || !delivery.password || !canInstall(session)) return;
    deliverSessionMutation.mutate({
      id: session.id,
      confirmInstall: true,
      temporarySsh: { username: delivery.username.trim(), password: delivery.password },
    });
    clearCustomPasswords();
  }

  function recoverSession() {
    if (!session || pending.any || !canRecover(session) || !recovery.username.trim() || !recovery.password) return;
    recoverSessionMutation.mutate({
      id: session.id,
      confirmInstall: true,
      temporarySsh: { username: recovery.username.trim(), password: recovery.password },
    });
    clearCustomPasswords();
  }

  function confirmHostKey(hostKeyFingerprint: string, physicalIdentityConfirmed = false) {
    if (!session) return;
    confirmHostKeyMutation.mutate({ id: session.id, hostKeyFingerprint, physicalIdentityConfirmed });
  }

  function removeSession(id: number) {
    removeSessionMutation.mutate(id, { onSuccess: close });
  }

  return {
    session,
    activeStep: session ? sessionStep(session) : step,
    setStep,
    form,
    updateForm: (patch) => setForm((current) => ({ ...current, ...patch })),
    delivery,
    setDelivery,
    recovery,
    setRecovery,
    artifactReady,
    setArtifactBusy,
    setSelectedArtifact,
    isCancelConfirmationOpen,
    setCancelConfirmationOpen,
    pending,
    errorMessages,
    close,
    createSession,
    deliverSession,
    recoverSession,
    confirmHostKey,
    removeSession,
  };
}
