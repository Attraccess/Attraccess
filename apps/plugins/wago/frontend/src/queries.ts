import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  claimController,
  confirmCommissioningHostKey,
  createCommissioningSession,
  deliverCommissioningSession,
  recoverCommissioningSession,
  applyPreset,
  getSettings,
  getDraft,
  listPresets,
  listControllers,
  listCommissioningSessions,
  listMqttServers,
  previewPreset,
  removeCommissioningSession,
  removeController,
  revokeCommissioningSession,
  saveDraft,
  setSettings,
  type ClaimControllerInput,
  type CreateCommissioningSessionInput,
  type WagoPresetApplication,
  type WagoConfigurationSnapshot,
  type ConfigurationEditorMetadata,
  validateConfiguration,
  reviewConfiguration,
  publishConfiguration,
  listConfigurationRevisions,
  previewConfigurationRevision,
  rollbackConfiguration,
  acknowledgeConfigurationRejection,
} from './api';

const queryKeys = {
  controllers: ['wago', 'controllers'] as const,
  settings: ['wago', 'settings'] as const,
  mqttServers: ['mqtt', 'servers'] as const,
  draft: (controllerId: number) => ['wago', 'configuration-draft', controllerId] as const,
  presets: ['wago', 'configuration-presets'] as const,
  revisions: (controllerId: number) => ['wago', 'configuration-revisions', controllerId] as const,
  commissioningSessions: ['wago', 'commissioning-sessions'] as const,
};

export function useControllersQuery() {
  return useQuery({
    queryKey: queryKeys.controllers,
    queryFn: listControllers,
    refetchInterval: 10_000,
  });
}

export function useCommissioningSessionsQuery() {
  return useQuery({
    queryKey: queryKeys.commissioningSessions,
    queryFn: () => listCommissioningSessions(),
    refetchInterval: 2_000,
  });
}

export function useSettingsQuery() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: getSettings,
  });
}

export function useMqttServersQuery() {
  return useQuery({
    queryKey: queryKeys.mqttServers,
    queryFn: listMqttServers,
  });
}

export function useUpdateSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: setSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });
}

export function useClaimControllerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: ClaimControllerInput }) => claimController(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.controllers });
    },
  });
}

export function useCreateCommissioningSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommissioningSessionInput) => createCommissioningSession(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.commissioningSessions }),
  });
}

export function useConfirmCommissioningHostKeyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, hostKeyFingerprint }: { id: number; hostKeyFingerprint: string }) =>
      confirmCommissioningHostKey(id, hostKeyFingerprint),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.commissioningSessions }),
  });
}

export function useDeliverCommissioningSessionMutation() {
  return useCommissioningAttemptMutation(deliverCommissioningSession, 'installation');
}

export function useRecoverCommissioningSessionMutation() {
  return useCommissioningAttemptMutation(recoverCommissioningSession, 'recovery');
}

function useCommissioningAttemptMutation(attempt: typeof deliverCommissioningSession, intent: 'installation' | 'recovery') {
  const queryClient = useQueryClient();

  return useMutation({
    gcTime: 0,
    retry: false,
    networkMode: 'always',
    mutationFn: (variables: Omit<Parameters<typeof deliverCommissioningSession>[1], 'confirmInstall'> & { id: number; confirmInstall: boolean }) => {
      const temporarySsh = { ...variables.temporarySsh };
      const confirmInstall = variables.confirmInstall;
      // React Query retains mutation variables, including after reset/unmount.
      // Scrub credentials and approval before starting the request.
      variables.temporarySsh.password = '';
      variables.temporarySsh.username = '';
      variables.confirmInstall = false;
      if (confirmInstall !== true) throw new Error(`Explicit ${intent} consent is required`);
      return attempt(variables.id, { confirmInstall, temporarySsh });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.controllers });
      await queryClient.invalidateQueries({ queryKey: queryKeys.commissioningSessions });
    },
  });
}

export function useRevokeCommissioningSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeCommissioningSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.commissioningSessions }),
  });
}

export function useRemoveCommissioningSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeCommissioningSession,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.controllers });
      await queryClient.invalidateQueries({ queryKey: queryKeys.commissioningSessions });
    },
  });
}

export function useRemoveControllerMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeController,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.controllers });
      await queryClient.invalidateQueries({ queryKey: queryKeys.commissioningSessions });
    },
  });
}

export function useDraftQuery(controllerId: number | null) {
  return useQuery({
    queryKey: queryKeys.draft(controllerId ?? 0),
    queryFn: () => getDraft(controllerId ?? 0),
    enabled: controllerId !== null,
  });
}

export function usePresetsQuery() {
  return useQuery({ queryKey: queryKeys.presets, queryFn: listPresets });
}

export function useSaveDraftMutation(controllerId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      snapshot,
      metadata,
    }: {
      snapshot: WagoConfigurationSnapshot;
      metadata: ConfigurationEditorMetadata;
    }) => saveDraft(controllerId, snapshot, metadata),
    onSuccess: (draft) => queryClient.setQueryData(queryKeys.draft(controllerId), draft),
  });
}

export function usePreviewPresetMutation(controllerId: number) {
  return useMutation({
    mutationFn: ({
      application,
      snapshot,
    }: {
      application: WagoPresetApplication;
      snapshot: WagoConfigurationSnapshot;
    }) => previewPreset(controllerId, application, snapshot),
  });
}

export function useApplyPresetMutation() {
  return useMutation({
    mutationFn: ({
      controllerId,
      application,
      selectedPaths,
      previewedDraftHash,
      snapshot,
    }: {
      controllerId: number;
      application: WagoPresetApplication;
      selectedPaths: string[];
      previewedDraftHash: string;
      snapshot: WagoConfigurationSnapshot;
    }) => applyPreset(controllerId, application, selectedPaths, previewedDraftHash, snapshot),
  });
}

export function useConfigurationRevisionsQuery(controllerId: number, offset: number) {
  return useQuery({
    queryKey: [...queryKeys.revisions(controllerId), offset],
    queryFn: () => listConfigurationRevisions(controllerId, offset),
    refetchInterval: 2_000,
  });
}

export function useConfigurationRevisionPreviewQuery(controllerId: number, revision: number, enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.revisions(controllerId), 'preview', revision],
    queryFn: () => previewConfigurationRevision(controllerId, revision),
    enabled,
  });
}

export function useConfigurationActions(controllerId: number) {
  const client = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.revisions(controllerId) }),
      client.invalidateQueries({ queryKey: queryKeys.draft(controllerId) }),
    ]);
  };
  const validate = useMutation({
    mutationFn: (snapshot: WagoConfigurationSnapshot) => validateConfiguration(controllerId, snapshot),
  });
  const review = useMutation({ mutationFn: () => reviewConfiguration(controllerId) });
  const publish = useMutation({
    mutationFn: ({ force, reviewedHash }: { force: boolean; reviewedHash: string }) =>
      publishConfiguration(controllerId, force, reviewedHash),
    onSuccess: refresh,
  });
  const preview = useMutation({
    mutationFn: (revision: number) => previewConfigurationRevision(controllerId, revision),
  });
  const rollback = useMutation({
    mutationFn: ({
      revision,
      force,
      sourceHash,
      currentHash,
      draftHash,
    }: {
      revision: number;
      force: boolean;
      sourceHash: string;
      currentHash: string | null;
      draftHash: string;
    }) => rollbackConfiguration(controllerId, revision, force, sourceHash, currentHash, draftHash),
    onSettled: refresh,
  });
  const acknowledgeRejection = useMutation({
    mutationFn: ({
      revision,
      contentHash,
      reportedAt,
    }: {
      revision: number;
      contentHash: string;
      reportedAt: string;
    }) => acknowledgeConfigurationRejection(controllerId, revision, contentHash, reportedAt),
    onSettled: refresh,
  });
  return { validate, review, publish, preview, rollback, acknowledgeRejection };
}
