import { useQueryClient } from '@tanstack/react-query';
import {
  UseAttractapServiceGetReaderReaderUiSettingsKeyFn,
  UseAttractapServiceGetReaderUiAlertsKeyFn,
  UseAttractapServiceGetResourceReaderUiSettingsKeyFn,
  useAttractapServiceClearReaderUiAlert,
  useAttractapServiceGetReaderReaderUiSettings,
  useAttractapServiceGetReaderUiAlerts,
  useAttractapServiceGetReaderUiContributions,
  useAttractapServiceGetResourceReaderUiSettings,
  useAttractapServiceUpdateReaderReaderUiSettings,
  useAttractapServiceUpdateResourceReaderUiSettings,
  type ReaderUiAlertDto,
  type ResourceReaderUiSettingsDto,
} from '@attraccess/react-query-client';

export type NoScreenPolicy = NonNullable<ResourceReaderUiSettingsDto['noScreenPolicy']>;
export type HookFailurePolicy = ResourceReaderUiSettingsDto['plugins'][number]['hookFailurePolicy'];
export type ResourceReaderUiSettings = ResourceReaderUiSettingsDto;
export type ReaderUiAlert = ReaderUiAlertDto;

export const useResourceReaderUiSettings = (resourceId: number) =>
  useAttractapServiceGetResourceReaderUiSettings({ resourceId });

export function useSaveResourceReaderUiSettings(resourceId: number) {
  const queryClient = useQueryClient();
  const mutation = useAttractapServiceUpdateResourceReaderUiSettings({
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: UseAttractapServiceGetResourceReaderUiSettingsKeyFn({ resourceId }) }),
  });
  return {
    ...mutation,
    mutate: (settings: ResourceReaderUiSettings, options?: Parameters<typeof mutation.mutate>[1]) =>
      mutation.mutate({ resourceId, requestBody: settings }, options),
  };
}

export const useReaderReaderUiSettings = (readerId: number | undefined) =>
  useAttractapServiceGetReaderReaderUiSettings({ readerId: readerId as number }, undefined, {
    enabled: readerId !== undefined,
  });

export function useSaveReaderReaderUiSettings(readerId: number | undefined) {
  const queryClient = useQueryClient();
  const mutation = useAttractapServiceUpdateReaderReaderUiSettings({
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: UseAttractapServiceGetReaderReaderUiSettingsKeyFn({ readerId: readerId as number }),
      }),
  });
  return {
    ...mutation,
    mutate: (settings: { widgetsEnabled: boolean }) =>
      mutation.mutate({ readerId: readerId as number, requestBody: settings }),
  };
}

export const useReaderUiContributions = (readerId: number | undefined) =>
  useAttractapServiceGetReaderUiContributions({ readerId: readerId as number }, undefined, {
    enabled: readerId !== undefined,
  });

export const useReaderUiAlerts = () =>
  useAttractapServiceGetReaderUiAlerts(undefined, { refetchInterval: 30_000 });

export function useClearReaderUiAlert() {
  const queryClient = useQueryClient();
  const mutation = useAttractapServiceClearReaderUiAlert({
    onSuccess: () => queryClient.invalidateQueries({ queryKey: UseAttractapServiceGetReaderUiAlertsKeyFn() }),
  });
  return { ...mutation, mutate: (alertId: number) => mutation.mutate({ alertId }) };
}
