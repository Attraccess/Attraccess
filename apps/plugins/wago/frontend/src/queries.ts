import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  claimController,
  createEnrollment,
  getSettings,
  listControllers,
  setSettings,
  type ClaimControllerInput,
  type CreateEnrollmentInput,
} from './api';

const queryKeys = {
  controllers: ['wago', 'controllers'] as const,
  settings: ['wago', 'settings'] as const,
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
