import { useMemo, useRef, useState } from 'react';
import { StatusDialog, TranslationMessage, useTranslations, useUrlQuery } from '@attraccess/plugins-frontend-ui';
import { useNavigate } from 'react-router-dom';
import en from './en.json';
import de from './de.json';
import {
  useUsersServiceConfirmDeleteAccount,
  useUsersServiceGetCurrentKey,
  ApiError,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { getTranslationKeyForApiError } from '../../utils/apiError';
import API_ERROR_TRANSLATIONS_EN from '../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../global-translations/api-errors.de.json';

const NON_RETRYABLE_ERRORS = [
  'DeleteAccountTokenInvalidException',
  'DeleteAccountTokenExpiredException',
  'Cannot delete the last administrator',
];

// Rejects free text in the link's email parameter, which the confirm dialog displays.
const isPlausibleEmail = (value: string) => value.length <= 254 && /^[^\s@]+@[^\s@]+$/.test(value);

export function ConfirmDeleteAccount() {
  const query = useUrlQuery();
  const navigate = useNavigate();
  const [error, setError] = useState<{ message: TranslationMessage; retryable: boolean } | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  // Values only end up as React text, which escapes them already.
  const { t, tMessage, tExists } = useTranslations(
    {
      en: { ...en, apiErrors: { ...API_ERROR_TRANSLATIONS_EN, ...en.apiErrors } },
      de: { ...de, apiErrors: { ...API_ERROR_TRANSLATIONS_DE, ...de.apiErrors } },
    },
    { escapeValues: false },
  );

  const token = useMemo(() => query.get('token'), [query]);
  const email = useMemo(() => query.get('email'), [query]);

  const queryClient = useQueryClient();
  // `isPending` reaches the render only after react-query notifies, so a fast double press needs this guard.
  const isSending = useRef(false);

  const confirmDelete = useUsersServiceConfirmDeleteAccount({
    retry: false,
    onSettled: () => {
      isSending.current = false;
    },
    onSuccess: () => {
      setIsSuccess(true);
      setError(null);
      queryClient.invalidateQueries({
        queryKey: [useUsersServiceGetCurrentKey],
      });
    },
    onError: (apiError) => {
      const { key, errorMessage } = getTranslationKeyForApiError({
        error: apiError as ApiError,
        t,
        tExists,
        baseTranslationKey: 'apiErrors',
        fallbackKey: 'unexpectedError',
      });
      // Some API errors translate to `{ title, description }`; the dialog has its own title.
      const messageKey = tExists(key) ? key : `${key}.description`;
      const { retryAfterSeconds } = ((apiError as ApiError).body ?? {}) as { retryAfterSeconds?: number };
      setError({
        message: { key: messageKey, data: { error: errorMessage, retryAfterSeconds } },
        retryable: !NON_RETRYABLE_ERRORS.includes(errorMessage),
      });
    },
  });

  const goToLogin = () => navigate('/');

  const leaveDeletedAccount = () => {
    // The deleted session's user stays cached after the failed refetch; reset it so the app signs out.
    queryClient.resetQueries({ queryKey: [useUsersServiceGetCurrentKey] });
    goToLogin();
  };

  const confirm = () => {
    if (!token || !email || confirmDelete.isPending || isSending.current) {
      return;
    }
    isSending.current = true;
    confirmDelete.mutate({ requestBody: { token, email } });
  };

  if (!token || !email || !isPlausibleEmail(email)) {
    return (
      <StatusDialog
        isOpen
        status="error"
        title={t('error.title')}
        closeLabel={t('error.backToLogin')}
        onClose={goToLogin}
        data-cy="confirm-delete-account-invalid-dialog"
      >
        {t('apiErrors.invalidLink')}
      </StatusDialog>
    );
  }

  if (isSuccess) {
    return (
      <StatusDialog
        isOpen
        status="success"
        title={t('success.title')}
        closeLabel={t('success.backToLogin')}
        onClose={leaveDeletedAccount}
        data-cy="confirm-delete-account-success-dialog"
      >
        {t('success.message')}
      </StatusDialog>
    );
  }

  if (error) {
    return (
      <StatusDialog
        isOpen
        status="error"
        title={t('error.title')}
        closeLabel={t('error.backToLogin')}
        onClose={goToLogin}
        action={
          error.retryable
            ? {
                label: t('error.tryAgain'),
                onPress: confirm,
                isPending: confirmDelete.isPending,
                'data-cy': 'confirm-delete-account-retry-button',
              }
            : undefined
        }
        data-cy="confirm-delete-account-error-dialog"
      >
        {tMessage(error.message)}
      </StatusDialog>
    );
  }

  return (
    <StatusDialog
      isOpen
      status="error"
      title={t('confirm.title')}
      closeLabel={t('confirm.cancel')}
      onClose={goToLogin}
      action={{
        label: t('confirm.action'),
        onPress: confirm,
        isPending: confirmDelete.isPending,
        'data-cy': 'confirm-delete-account-confirm-button',
      }}
      data-cy="confirm-delete-account-dialog"
    >
      {t('confirm.description', { email })}
    </StatusDialog>
  );
}
