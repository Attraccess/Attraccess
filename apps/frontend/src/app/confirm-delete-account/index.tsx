import { useMemo, useState } from 'react';
import { StatusDialog, useTranslations, useUrlQuery } from '@attraccess/plugins-frontend-ui';
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

const NON_RETRYABLE_ERRORS = ['DeleteAccountTokenInvalidException', 'DeleteAccountTokenExpiredException'];

export function ConfirmDeleteAccount() {
  const query = useUrlQuery();
  const navigate = useNavigate();
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const { t, tExists } = useTranslations({
    en: { ...en, apiErrors: { ...API_ERROR_TRANSLATIONS_EN, ...en.apiErrors } },
    de: { ...de, apiErrors: { ...API_ERROR_TRANSLATIONS_DE, ...de.apiErrors } },
  });

  const token = useMemo(() => query.get('token'), [query]);
  const email = useMemo(() => query.get('email'), [query]);

  const queryClient = useQueryClient();

  const confirmDelete = useUsersServiceConfirmDeleteAccount({
    retry: false,
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
      setError({
        message: t(key, { error: errorMessage }),
        retryable: !NON_RETRYABLE_ERRORS.some((name) => key.endsWith(`.${name}`)),
      });
    },
  });

  const goToLogin = () => navigate('/');

  const confirm = () => {
    if (!token || !email || confirmDelete.isPending) {
      return;
    }
    confirmDelete.mutate({ requestBody: { token, email } });
  };

  if (!token || !email) {
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
        onClose={goToLogin}
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
        {error.message}
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
