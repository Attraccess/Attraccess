import { ApiError, useFindManyKey, useGetCurrentKey, useGetOneUserByIdKey } from '@attraccess/react-query-client';
import { TFunction, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useToastMessage } from '../toastProvider';
import { useUserNameFields } from './useUserNameFields';
import de from './de.json';
import en from './en.json';

/** The request body of both name endpoints. A blank name is sent as null. */
export interface UserNameBody {
  firstName: string | null;
  lastName: string | null;
}

/** Error codes of the name endpoints that have their own message. */
const TRANSLATED_ERROR_CODES: Record<string, string> = {
  SSO_NAME_CHANGE_FORBIDDEN: 'ssoNameChangeForbidden',
};

/** A translated message for a known error code, the server's message otherwise, or a generic fallback. */
function getUserNameErrorMessage(error: unknown, t: TFunction): string {
  const body = error instanceof ApiError ? (error.body as { message?: string | string[] } | undefined) : undefined;
  const message = Array.isArray(body?.message) ? body?.message[0] : body?.message;
  if (typeof message !== 'string' || !message.trim()) {
    return t('updateFailed');
  }
  const translationKey = TRANSLATED_ERROR_CODES[message];
  return translationKey ? t(translationKey) : message;
}

/**
 * Field state, request body and save callbacks of the name forms: `NameForm` (account settings) and `ChangeNameForm`
 * (user management). After a save it refreshes every query that shows the name.
 */
export function useUserNameForm(user: { firstName: string | null; lastName: string | null } | undefined) {
  const { t } = useTranslations({ en, de });
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToastMessage();
  const { firstName, setFirstName, lastName, setLastName } = useUserNameFields(user);

  const body = useMemo<UserNameBody>(
    () => ({ firstName: firstName.trim() || null, lastName: lastName.trim() || null }),
    [firstName, lastName],
  );

  const onSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [useGetCurrentKey] });
    queryClient.invalidateQueries({ queryKey: [useGetOneUserByIdKey] });
    queryClient.invalidateQueries({ queryKey: [useFindManyKey] });
    showSuccess({ title: t('updated') });
  }, [queryClient, showSuccess, t]);

  const onError = useCallback(
    (error: unknown) => showError({ title: getUserNameErrorMessage(error, t) }),
    [showError, t],
  );

  const mutationOptions = useMemo(() => ({ onSuccess, onError }), [onSuccess, onError]);

  return { firstName, setFirstName, lastName, setLastName, body, mutationOptions };
}
