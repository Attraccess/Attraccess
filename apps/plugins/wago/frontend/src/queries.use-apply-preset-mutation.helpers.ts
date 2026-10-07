import { useWagoLiveQuery } from './live-updates';
import { useMutation } from '@tanstack/react-query';
import { applyPreset } from './api';
import type { WagoPresetApplication } from './api';
import type { WagoConfigurationSnapshot } from './api';
import { useQueryClient } from '@tanstack/react-query';
import { claimController } from './api';
import type { ClaimControllerInput } from './api';
import { queryKeys } from './queries.query-keys';
import { deliverCommissioningSession } from './api';
import { useQuery } from '@tanstack/react-query';
import { listCommissioningSessions } from './api';
import { FLOW_NODE_PREVIEW_QUERY_KEY } from '@attraccess/plugins-frontend-sdk';
import { validateConfiguration } from './api';
import { reviewConfiguration } from './api';
import { publishConfiguration } from './api';
import { previewConfigurationRevision } from './api';
import { acknowledgeConfigurationRejection } from './api';
import { rollbackConfiguration } from './api';
import { getConfigurationBaseline } from './api';

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

export function useClaimControllerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: ClaimControllerInput }) => claimController(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.controllers });
    },
  });
}

export function useCommissioningAttemptMutation(
  attempt: typeof deliverCommissioningSession,
  intent: 'installation' | 'recovery',
) {
  const queryClient = useQueryClient();

  return useMutation({
    gcTime: 0,
    retry: false,
    networkMode: 'always',
    mutationFn: (
      variables: Omit<Parameters<typeof deliverCommissioningSession>[1], 'confirmInstall'> & {
        id: number;
        confirmInstall: boolean;
      },
    ) => {
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

export function useCommissioningSessionsQuery() {
  useWagoLiveQuery(queryKeys.commissioningSessions, 'commissioning-sessions');
  return useQuery({
    queryKey: queryKeys.commissioningSessions,
    queryFn: ({ signal }) => listCommissioningSessions(100, 0, signal),
  });
}

export function useConfigurationActions(controllerId: number) {
  const client = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.revisions(controllerId) }),
      client.invalidateQueries({ queryKey: queryKeys.draft(controllerId) }),
      client.invalidateQueries({ queryKey: FLOW_NODE_PREVIEW_QUERY_KEY }),
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
    onSuccess: refresh,
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
  return { validate, review, publish, preview, acknowledgeRejection, rollback };
}

export function useConfigurationBaselineQuery(controllerId: number, enabled: boolean) {
  useWagoLiveQuery(
    ['wago', 'configuration-baseline', controllerId],
    'configuration-baseline',
    String(controllerId),
    enabled,
  );
  return useQuery({
    queryKey: ['wago', 'configuration-baseline', controllerId],
    queryFn: () => getConfigurationBaseline(controllerId),
    enabled,
  });
}

export function useConfigurationRevisionPreviewQuery(controllerId: number, revision: number, enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.revisions(controllerId), 'preview', revision],
    queryFn: () => previewConfigurationRevision(controllerId, revision),
    enabled,
  });
}
