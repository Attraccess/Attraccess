import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  claimController,
  confirmCodesysStop,
  confirmCommissioningHostKey,
  confirmWbmBootstrap,
  createCommissioningSession,
  deliverCommissioningSession,
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
} from './api';

const queryKeys = {
  controllers: ['wago', 'controllers'] as const,
  settings: ['wago', 'settings'] as const,
  mqttServers: ['mqtt', 'servers'] as const,
  draft: (controllerId: number) => ['wago', 'configuration-draft', controllerId] as const,
  presets: ['wago', 'configuration-presets'] as const,
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
    mutationFn: ({ id, hostKeyFingerprint }: { id: number; hostKeyFingerprint: string }) => confirmCommissioningHostKey(id, hostKeyFingerprint),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.commissioningSessions }),
  });
}

function useCommissioningConfirmationMutation(mutationFn: (id: number) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.commissioningSessions }),
  });
}

export function useConfirmWbmBootstrapMutation() {
  return useCommissioningConfirmationMutation(confirmWbmBootstrap);
}

export function useConfirmCodesysStopMutation() {
  return useCommissioningConfirmationMutation(confirmCodesysStop);
}

export function useDeliverCommissioningSessionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: Parameters<typeof deliverCommissioningSession>[1] & { id: number }) =>
      deliverCommissioningSession(id, input),
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
    mutationFn: (snapshot: unknown) => saveDraft(controllerId, snapshot),
    onSuccess: (draft) => queryClient.setQueryData(queryKeys.draft(controllerId), draft),
  });
}

export function usePreviewPresetMutation(controllerId: number) {
  return useMutation({ mutationFn: (application: WagoPresetApplication) => previewPreset(controllerId, application) });
}

export function useApplyPresetMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      controllerId,
      application,
      selectedPaths,
      previewedDraftHash,
    }: {
      controllerId: number;
      application: WagoPresetApplication;
      selectedPaths: string[];
      previewedDraftHash: string;
    }) => applyPreset(controllerId, application, selectedPaths, previewedDraftHash),
    onSuccess: (draft, { controllerId }) => queryClient.setQueryData(queryKeys.draft(controllerId), draft),
  });
}
