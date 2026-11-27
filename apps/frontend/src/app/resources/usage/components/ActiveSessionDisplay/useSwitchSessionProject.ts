import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ApiError, useResourceUsageSwitchSessionProject } from '@attraccess/react-query-client';
import { recordUsefulAction } from '../../../../../components/DonationPrompt/usefulAction';
import { useToastMessage } from '../../../../../components/toastProvider';
import { useRefreshNetworkRestrictionOnError } from '../../../../../hooks/useRefreshNetworkRestrictionOnError';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import { invalidateSwitchedSession } from './invalidateSwitchedSession';
import en from './switchProject/en.json';
import de from './switchProject/de.json';

/** The project switch of a running session: the request, what it refreshes and how it reports. */
export function useSwitchSessionProject(resourceId: number, onSwitched: () => void) {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const refreshNetworkRestriction = useRefreshNetworkRestrictionOnError();

  const reportError = useCallback(
    (error: unknown) => {
      refreshNetworkRestriction(error as ApiError);
      toast.apiError({ baseTranslationKey: 'api', t, tExists, error: error as ApiError });
    },
    [refreshNetworkRestriction, toast, t, tExists],
  );

  const mutation = useResourceUsageSwitchSessionProject(undefined, {
    onSuccess: async (continuation) => {
      recordUsefulAction();
      onSwitched();
      toast.success({
        title: t('success.title'),
        description: continuation.project
          ? t('success.project', { name: continuation.project.name })
          : t('success.noProject'),
      });
      await invalidateSwitchedSession(queryClient, resourceId);
    },
    onError: async (error) => {
      reportError(error);
      // A refused switch may mean the session changed meanwhile.
      await invalidateSwitchedSession(queryClient, resourceId);
    },
  });

  return { mutate: mutation.mutate, isPending: mutation.isPending, reportError };
}
