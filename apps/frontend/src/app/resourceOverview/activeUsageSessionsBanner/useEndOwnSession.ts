import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  useResourceUsageEndSession,
  UseResourceUsageGetActiveSessionKeyFn,
  resourceUsageGetActiveSession,
} from '@attraccess/react-query-client';
import { useAuth } from '../../../hooks/useAuth';
import { getTranslationKeyForApiError } from '../../../utils/apiError';
import en from './translations/en.json';
import de from './translations/de.json';
import API_ERROR_TRANSLATIONS_DE from '../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../global-translations/api-errors.en.json';

/**
 * Ends the signed-in user's own session at a resource, by its id: on a shared machine the resource may hold several
 * sessions. When none of the user's sessions is left there (it ended meanwhile), there is nothing to end.
 */
export function useEndOwnSession() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const invalidateActiveSession = useCallback(
    (resourceId: number) =>
      queryClient.invalidateQueries({
        queryKey: UseResourceUsageGetActiveSessionKeyFn({ path: { resourceId } }),
      }),
    [queryClient],
  );
  const { mutateAsync: endSession } = useResourceUsageEndSession(undefined, {
    onSuccess: (data) => invalidateActiveSession(data.resourceId),
  });

  return useCallback(
    async (resourceId: number) => {
      if (!user) throw new Error('Not signed in');
      const active = await resourceUsageGetActiveSession({ path: { resourceId }, throwOnError: true }).then(
        ({ data }) => data,
      );
      const ownSession = active.usages.find((usage) => usage.userId === user.id);
      if (ownSession) {
        await endSession({ path: { resourceId }, body: { usageId: ownSession.id } });
      } else {
        await invalidateActiveSession(resourceId);
      }
    },
    [user, endSession, invalidateActiveSession],
  );
}

/** The translated title and description for an error from useEndOwnSession. */
export function useEndSessionErrorMessage() {
  const { t, tExists } = useTranslations({
    en: { api: { ...API_ERROR_TRANSLATIONS_EN, ...en.apiErrors } },
    de: { api: { ...API_ERROR_TRANSLATIONS_DE, ...de.apiErrors } },
  });

  return useCallback(
    (error: unknown) => {
      const { key, errorMessage } = getTranslationKeyForApiError({
        baseTranslationKey: 'api',
        error: error as ApiError,
        t,
        tExists,
      });
      return { title: t(`${key}.title`), description: t(`${key}.description`, { error: errorMessage }) };
    },
    [t, tExists],
  );
}
