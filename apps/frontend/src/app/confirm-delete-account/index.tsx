import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUrlQuery, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useNavigate } from 'react-router-dom';
import { Loading } from '../loading';
import { Alert, Button, Card, CardBody, CardFooter, CardHeader } from '@heroui/react';
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

export function ConfirmDeleteAccount() {
  const query = useUrlQuery();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [allowRetry, setAllowRetry] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { t, tExists } = useTranslations({
    en: { ...en, apiErrors: { ...API_ERROR_TRANSLATIONS_EN, ...en.apiErrors } },
    de: { ...de, apiErrors: { ...API_ERROR_TRANSLATIONS_DE, ...de.apiErrors } },
  });

  const token = useMemo(() => query.get('token'), [query]);
  const email = useMemo(() => query.get('email'), [query]);

  const queryClient = useQueryClient();
  const didSendRequest = useRef(false);

  const confirmDelete = useUsersServiceConfirmDeleteAccount({
    retry: false,
    onSuccess: () => {
      setIsSuccess(true);
      setError(null);
      queryClient.invalidateQueries({
        queryKey: [useUsersServiceGetCurrentKey],
      });
    },
    onError: (error) => {
      const { key, errorMessage } = getTranslationKeyForApiError({
        error: error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'apiErrors',
        fallbackKey: 'unexpectedError',
      });
      const translation = t(key, { error: errorMessage });
      setError(translation);
      setAllowRetry(true);
    },
  });

  const confirm = useCallback((force = false) => {
    if (didSendRequest.current && !force) {
      return;
    }

    if (!token || !email) {
      setError(t('apiErrors.invalidLink'));
      didSendRequest.current = true;
      return;
    }

    didSendRequest.current = true;
    setAllowRetry(false);
    confirmDelete.mutate({ requestBody: { token, email } });
  }, [confirmDelete, email, token, t]);

  useEffect(() => {
    if (token && email) {
      confirm();
    } else if (token !== null && email !== null) {
      setError(t('apiErrors.invalidLink'));
      didSendRequest.current = true;
    }
  }, [confirm, email, token, t]);

  useEffect(() => {
    if (!didSendRequest.current || confirmDelete.isPending || isSuccess || error) {
      return;
    }

    const timeout = setTimeout(() => {
      if (!confirmDelete.isPending && !isSuccess && !error && didSendRequest.current) {
        setError(t('apiErrors.unexpectedError'));
        didSendRequest.current = false;
      }
    }, 3000);

    return () => clearTimeout(timeout);
  }, [confirmDelete.isPending, isSuccess, error, t]);

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full" data-cy="confirm-delete-success-card">
          <CardHeader className="text-center">
            <h2 className="text-3xl font-bold">{t('success.title')}</h2>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center">{t('success.message')}</p>
          </CardBody>
          <CardFooter>
            <Button fullWidth color="primary" onPress={() => navigate('/')} data-cy="confirm-delete-success-button">
              {t('success.backToLogin')}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full" data-cy="confirm-delete-error-card">
          <CardHeader className="text-center">
            <h2 className="text-3xl font-bold">{t('error.title')}</h2>
          </CardHeader>
          <CardBody>
            <Alert color="danger" title={t('error.errorTitle')} description={error} data-cy="confirm-delete-error-alert" />
          </CardBody>
          <CardFooter className="flex flex-col gap-2">
            {allowRetry && (
              <Button
                fullWidth
                color="primary"
                onPress={() => confirm(true)}
                isDisabled={confirmDelete.isPending}
                data-cy="confirm-delete-error-try-again-button"
              >
                {t('error.tryAgain')}
              </Button>
            )}
            <Button
              fullWidth
              variant="bordered"
              onPress={() => navigate('/')}
              data-cy="confirm-delete-error-back-button"
            >
              {t('error.backToLogin')}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (confirmDelete.isPending) {
    return <Loading />;
  }

  return <Loading />;
}
