import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ApiError, useResourceUsageSwitchSessionProject } from '@attraccess/react-query-client';
import { recordUsefulAction } from '../../../../../components/DonationPrompt/usefulAction';
import { useToastMessage } from '../../../../../components/toastProvider';
import { useRefreshNetworkRestrictionOnError } from '../../../../../hooks/useRefreshNetworkRestrictionOnError';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import { invalidateSwitchedSession } from '../../invalidateSwitchedSession';
import { switchErrorFallbackKey } from './switchErrorFallbackKey';
import en from './switchProject/en.json';
import de from './switchProject/de.json';

/** The project switch of a running session: the request, what it refreshes and how it reports. */
export function useSwitchSessionProject(resourceId: number, onSwitched: () => void) {
  // The switch's own wording of a refusal wins over the general one: it has to say what became of the project.
  const { t, tExists } = useTranslations({
    en: { ...en, api: { ...API_ERROR_TRANSLATIONS_EN, ...en.errors } },
    de: { ...de, api: { ...API_ERROR_TRANSLATIONS_DE, ...de.errors } },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const refreshNetworkRestriction = useRefreshNetworkRestrictionOnError();

  const showError = useCallback(
    (error: unknown, fallbackKey: string) => {
      refreshNetworkRestriction(error as ApiError);
      toast.apiError({ baseTranslationKey: 'api', t, tExists, error: error as ApiError, fallbackKey });
    },
    [refreshNetworkRestriction, toast, t, tExists],
  );

  /** A failure before the switch was requested, e.g. loading its forms. */
  const reportError = useCallback((error: unknown) => showError(error, 'PROJECT_SWITCH_FAILED'), [showError]);

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
      showError(error, switchErrorFallbackKey(error));
      // A refused switch may mean the session changed meanwhile.
      await invalidateSwitchedSession(queryClient, resourceId);
    },
  });

  return { mutate: mutation.mutate, isPending: mutation.isPending, reportError };
}
