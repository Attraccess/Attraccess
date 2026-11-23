import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { NETWORK_RESTRICTION_DEFAULT_HEADER, NETWORK_RESTRICTION_DEFAULT_RANGES } from '@attraccess/application-models';
import {
  ApiError,
  NetworkIpSource,
  NetworkRestrictedAction,
  NetworkRestrictionRoleMatrixDto,
  NetworkRestrictionSettingsDto,
  UseGetNetworkRestrictionRoleActionsKeyFn,
  UseGetNetworkRestrictionSettingsKeyFn,
  useGetNetworkRestrictionRoleActions,
  useGetNetworkRestrictionSettings,
  useGetNetworkRestrictionStatusKey,
  useUpdateNetworkRestrictionRoleActions,
  useUpdateNetworkRestrictionSettings,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../components/toastProvider';
import { getApiErrorMessage } from '../../../../utils/apiError';
import en from './networkRestriction/en.json';
import de from './networkRestriction/de.json';

/** The network restriction form as shown: the edited value where there is one, the saved value otherwise. */
export interface NetworkRestrictionShown {
  enabled: boolean;
  ranges: string[];
  ipSource: NetworkIpSource;
  headerName: string;
}

/** A failed save, by the group that failed, so the card can show it next to that group. */
export interface NetworkRestrictionSaveError {
  group: 'settings' | 'roles';
  message: string;
}

export interface NetworkRestrictionDrafts {
  settings: NetworkRestrictionSettingsDto | undefined;
  isSettingsLoading: boolean;
  matrix: NetworkRestrictionRoleMatrixDto | undefined;
  isMatrixError: boolean;
  shown: NetworkRestrictionShown;
  toggleEnabled: (next: boolean) => void;
  addRanges: (entries: string[]) => void;
  removeRange: (entry: string) => void;
  setIpSource: (source: NetworkIpSource) => void;
  setHeaderName: (name: string) => void;
  roleDraft: Record<number, NetworkRestrictedAction[]>;
  toggleRoleAction: (roleId: number, action: NetworkRestrictedAction, allowed: boolean) => void;
  /** Switched on with no allowed range: nobody would be inside, so Save is blocked until a range is entered. */
  isRangesMissing: boolean;
  isDirty: boolean;
  isSaving: boolean;
  isSaveDisabled: boolean;
  error: NetworkRestrictionSaveError | null;
  save: () => Promise<void>;
  discard: () => void;
}

/** Unsaved network restriction edits, shared by NetworkRestrictionCard (the form) and SecuritySaveBar (save/discard). */
export function useNetworkRestrictionDrafts(): NetworkRestrictionDrafts {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { data: settings, isLoading: isSettingsLoading } = useGetNetworkRestrictionSettings();
  const { data: matrix, isError: isMatrixError } = useGetNetworkRestrictionRoleActions();
  const updateSettings = useUpdateNetworkRestrictionSettings();
  const updateRoleActions = useUpdateNetworkRestrictionRoleActions();

  const [enabled, setEnabled] = useState<boolean | undefined>();
  const [ranges, setRanges] = useState<string[] | undefined>();
  const [ipSource, setIpSource] = useState<NetworkIpSource | undefined>();
  const [headerName, setHeaderName] = useState<string | undefined>();
  const [roleDraft, setRoleDraft] = useState<Record<number, NetworkRestrictedAction[]>>({});
  const [error, setError] = useState<NetworkRestrictionSaveError | null>(null);

  const shown: NetworkRestrictionShown = {
    enabled: enabled ?? settings?.enabled ?? false,
    ranges: ranges ?? settings?.allowedRanges ?? [],
    ipSource: ipSource ?? settings?.ipSource ?? NetworkIpSource.CLIENT,
    headerName: headerName ?? settings?.headerName ?? NETWORK_RESTRICTION_DEFAULT_HEADER,
  };

  const settingsDirty =
    settings !== undefined &&
    (shown.enabled !== settings.enabled ||
      shown.ranges.join(',') !== settings.allowedRanges.join(',') ||
      shown.ipSource !== settings.ipSource ||
      shown.headerName !== settings.headerName);
  const rolesDirty = Object.keys(roleDraft).length > 0;
  const isRangesMissing = shown.enabled && shown.ranges.length === 0;

  const discardSettings = () => {
    setEnabled(undefined);
    setRanges(undefined);
    setIpSource(undefined);
    setHeaderName(undefined);
  };

  const discard = () => {
    discardSettings();
    setRoleDraft({});
    setError(null);
  };

  const toggleRoleAction = (roleId: number, action: NetworkRestrictedAction, allowed: boolean) => {
    const saved = matrix?.roles.find((role) => role.roleId === roleId)?.actions ?? [];
    const current = roleDraft[roleId] ?? saved;
    const next = allowed ? [...new Set([...current, action])] : current.filter((entry) => entry !== action);
    const unchanged = next.length === saved.length && next.every((entry) => saved.includes(entry));
    setRoleDraft((draft) => {
      const { [roleId]: _removed, ...rest } = draft;
      return unchanged ? rest : { ...rest, [roleId]: next };
    });
  };

  const addRanges = (entries: string[]) => setRanges([...new Set([...shown.ranges, ...entries])]);
  const removeRange = (entry: string) => setRanges(shown.ranges.filter((range) => range !== entry));

  const toggleEnabled = (next: boolean) => {
    setEnabled(next);
    // Suggest the private ranges when switching on with an empty list; the admin can edit them before saving.
    if (next && shown.ranges.length === 0) setRanges([...NETWORK_RESTRICTION_DEFAULT_RANGES]);
  };

  const fail = (group: NetworkRestrictionSaveError['group'], failure: unknown) => {
    // A bad range or header name is a 400 that names the offending value.
    const message = getApiErrorMessage(failure as ApiError);
    setError({ group, message });
    toast.error({ title: t('error.title'), description: message });
  };

  const save = async () => {
    setError(null);
    if (settingsDirty) {
      let saved: NetworkRestrictionSettingsDto;
      try {
        saved = await updateSettings.mutateAsync({
          body: {
            enabled: shown.enabled,
            allowedRanges: shown.ranges,
            ipSource: shown.ipSource,
            headerName: shown.headerName,
          },
        });
      } catch (failure) {
        fail('settings', failure);
        return;
      }
      // Prime from the response and release the draft in the same tick: waiting for a refetch left Save enabled
      // with the draft still differing from the old data, so a second click saved again. Done before the role
      // table is saved, so a failing role save does not leave the card showing the old settings.
      queryClient.setQueryData(UseGetNetworkRestrictionSettingsKeyFn(), saved);
      discardSettings();
      void queryClient.invalidateQueries({ queryKey: [useGetNetworkRestrictionStatusKey] });
    }
    if (rolesDirty) {
      let savedMatrix: NetworkRestrictionRoleMatrixDto;
      try {
        savedMatrix = await updateRoleActions.mutateAsync({
          body: { roles: Object.entries(roleDraft).map(([roleId, actions]) => ({ roleId: Number(roleId), actions })) },
        });
      } catch (failure) {
        fail('roles', failure);
        return;
      }
      queryClient.setQueryData(UseGetNetworkRestrictionRoleActionsKeyFn(), savedMatrix);
      setRoleDraft({});
      void queryClient.invalidateQueries({ queryKey: [useGetNetworkRestrictionStatusKey] });
    }
    toast.success({ title: t('saved.title'), description: t('saved.description') });
  };

  return {
    settings,
    isSettingsLoading,
    matrix,
    isMatrixError,
    shown,
    toggleEnabled,
    addRanges,
    removeRange,
    setIpSource,
    setHeaderName,
    roleDraft,
    toggleRoleAction,
    isRangesMissing,
    isDirty: settingsDirty || rolesDirty,
    isSaving: updateSettings.isPending || updateRoleActions.isPending,
    isSaveDisabled: isRangesMissing,
    error,
    save,
    discard,
  };
}
