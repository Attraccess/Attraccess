import { useWagoLiveQuery } from './live-updates';
import { useQuery } from '@tanstack/react-query';
import { listConfigurationRevisions } from './api';
import { queryKeys } from './queries.query-keys';
import { useMutation } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { confirmCommissioningHostKey } from './api';
import { listControllers } from './api';
import { createCommissioningSession } from './api';
import type { CreateCommissioningSessionInput } from './api';
import { deliverCommissioningSession } from './api';
import { useCommissioningAttemptMutation } from './queries.use-apply-preset-mutation.helpers';
import { getDraft } from './api';
import { listMqttServers } from './api';
import { listPresets } from './api';
import { previewPreset } from './api';
import type { WagoPresetApplication } from './api';
import type { WagoConfigurationSnapshot } from './api';
import { recoverCommissioningSession } from './api';
import { removeCommissioningSession } from './api';
import { removeController } from './api';
import { revokeCommissioningSession } from './api';
import type { DraftIdentity } from './api';
import { saveDraft } from './api';
import type { ConfigurationEditorMetadata } from './api';

export function useConfigurationRevisionsQuery(controllerId: number, offset: number) {
  useWagoLiveQuery(
    [...queryKeys.revisions(controllerId), offset],
    'configuration-revisions',
    `${controllerId}:${offset}`,
  );
  return useQuery({
    queryKey: [...queryKeys.revisions(controllerId), offset],
    queryFn: () => listConfigurationRevisions(controllerId, offset),
  });
}

export function useConfirmCommissioningHostKeyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      hostKeyFingerprint,
      physicalIdentityConfirmed,
    }: {
      id: number;
      hostKeyFingerprint: string;
      physicalIdentityConfirmed?: boolean;
    }) => confirmCommissioningHostKey(id, hostKeyFingerprint, physicalIdentityConfirmed),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.commissioningSessions }),
  });
}

export function useControllersQuery() {
  useWagoLiveQuery(queryKeys.controllers, 'controllers');
  return useQuery({
    queryKey: queryKeys.controllers,
    queryFn: listControllers,
  });
}

export function useCreateCommissioningSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommissioningSessionInput) => createCommissioningSession(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.commissioningSessions }),
  });
}

export function useDeliverCommissioningSessionMutation() {
  return useCommissioningAttemptMutation(deliverCommissioningSession, 'installation');
}

export function useDraftQuery(controllerId: number | null) {
  return useQuery({
    queryKey: queryKeys.draft(controllerId ?? 0),
    queryFn: () => getDraft(controllerId ?? 0),
    enabled: controllerId !== null,
  });
}

export function useMqttServersQuery() {
  return useQuery({
    queryKey: queryKeys.mqttServers,
    queryFn: listMqttServers,
  });
}

export function usePresetsQuery() {
  return useQuery({ queryKey: queryKeys.presets, queryFn: listPresets });
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

export function useRecoverCommissioningSessionMutation() {
  return useCommissioningAttemptMutation(recoverCommissioningSession, 'recovery');
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

export function useRevokeCommissioningSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeCommissioningSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.commissioningSessions }),
  });
}

export function useSaveDraftMutation(controllerId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      snapshot,
      metadata,
      expectedDraft,
    }: {
      snapshot: WagoConfigurationSnapshot;
      metadata?: ConfigurationEditorMetadata;
      expectedDraft?: DraftIdentity | null;
    }) => saveDraft(controllerId, snapshot, metadata, expectedDraft),
    onSuccess: (draft) => queryClient.setQueryData(queryKeys.draft(controllerId), draft),
  });
}
