import { useQueryClient } from '@tanstack/react-query';
import {
  UseGetReaderReaderUiSettingsKeyFn,
  UseGetReaderUiAlertsKeyFn,
  UseGetResourceReaderUiSettingsKeyFn,
  useClearReaderUiAlert as useClearReaderUiAlertMutation,
  useGetReaderReaderUiSettings,
  useGetReaderUiAlerts,
  useGetReaderUiContributions,
  useGetResourceReaderUiSettings,
  useUpdateReaderReaderUiSettings,
  useUpdateResourceReaderUiSettings,
  type ReaderUiAlertDto,
  type ResourceReaderUiSettingsDto,
} from '@attraccess/react-query-client';

export type NoScreenPolicy = NonNullable<ResourceReaderUiSettingsDto['noScreenPolicy']>;
export type HookFailurePolicy = ResourceReaderUiSettingsDto['plugins'][number]['hookFailurePolicy'];
export type ResourceReaderUiSettings = ResourceReaderUiSettingsDto;
export type ReaderUiAlert = ReaderUiAlertDto;

export const useResourceReaderUiSettings = (resourceId: number) =>
  useGetResourceReaderUiSettings({ path: { resourceId } });

export function useSaveResourceReaderUiSettings(resourceId: number) {
  const queryClient = useQueryClient();
  const mutation = useUpdateResourceReaderUiSettings(undefined, {
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: UseGetResourceReaderUiSettingsKeyFn({ path: { resourceId } }) }),
  });
  return {
    ...mutation,
    mutate: (settings: ResourceReaderUiSettings, options?: Parameters<typeof mutation.mutate>[1]) =>
      mutation.mutate({ path: { resourceId }, body: settings }, options),
  };
}

export const useReaderReaderUiSettings = (readerId: number | undefined) =>
  useGetReaderReaderUiSettings({ path: { readerId: readerId as number } }, undefined, {
    enabled: readerId !== undefined,
  });

export function useSaveReaderReaderUiSettings(readerId: number | undefined) {
  const queryClient = useQueryClient();
  const mutation = useUpdateReaderReaderUiSettings(undefined, {
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: UseGetReaderReaderUiSettingsKeyFn({ path: { readerId: readerId as number } }),
      }),
  });
  return {
    ...mutation,
    mutate: (settings: { widgetsEnabled: boolean }, options?: Parameters<typeof mutation.mutate>[1]) =>
      mutation.mutate({ path: { readerId: readerId as number }, body: settings }, options),
  };
}

export const useReaderUiContributions = (readerId: number | undefined) =>
  useGetReaderUiContributions({ path: { readerId: readerId as number } }, undefined, {
    enabled: readerId !== undefined,
  });

export const useReaderUiAlerts = () => useGetReaderUiAlerts({}, undefined, { refetchInterval: 30_000 });

export function useClearReaderUiAlert() {
  const queryClient = useQueryClient();
  const mutation = useClearReaderUiAlertMutation(undefined, {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: UseGetReaderUiAlertsKeyFn() }),
  });
  return {
    ...mutation,
    mutate: (alertId: number, options?: Parameters<typeof mutation.mutate>[1]) =>
      mutation.mutate({ path: { alertId } }, options),
  };
}
