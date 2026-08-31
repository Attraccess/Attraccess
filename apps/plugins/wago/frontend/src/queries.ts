import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  claimController,
  createEnrollment,
  getEnrollmentCredentialSupport,
  applyPreset,
  getSettings,
  getDraft,
  listPresets,
  listControllers,
  listMqttServers,
  previewPreset,
  saveDraft,
  setSettings,
  type ClaimControllerInput,
  type CreateEnrollmentInput,
  type WagoPresetApplication,
} from './api';

const queryKeys = {
  controllers: ['wago', 'controllers'] as const,
  settings: ['wago', 'settings'] as const,
  mqttServers: ['mqtt', 'servers'] as const,
  enrollmentCredentialSupport: (mqttServerId: number) => ['wago', 'enrollment-credential-support', mqttServerId] as const,
  draft: (controllerId: number) => ['wago', 'configuration-draft', controllerId] as const,
  presets: ['wago', 'configuration-presets'] as const,
};

export function useControllersQuery() {
  return useQuery({
    queryKey: queryKeys.controllers,
    queryFn: listControllers,
    refetchInterval: 10_000,
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

export function useCreateEnrollmentMutation() {
  return useMutation({ mutationFn: (input: CreateEnrollmentInput) => createEnrollment(input) });
}

export function useEnrollmentCredentialSupportQuery(mqttServerId: number | null) {
  return useQuery({
    queryKey: queryKeys.enrollmentCredentialSupport(mqttServerId ?? 0),
    queryFn: () => getEnrollmentCredentialSupport(mqttServerId ?? 0),
    enabled: mqttServerId !== null,
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

export function useApplyPresetMutation(controllerId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      application,
      selectedPaths,
      previewedDraftHash,
    }: {
      application: WagoPresetApplication;
      selectedPaths: string[];
      previewedDraftHash: string;
    }) => applyPreset(controllerId, application, selectedPaths, previewedDraftHash),
    onSuccess: (draft) => queryClient.setQueryData(queryKeys.draft(controllerId), draft),
  });
}
