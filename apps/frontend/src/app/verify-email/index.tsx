import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUrlQuery } from '@attraccess/plugins-frontend-ui';
import { useNavigate } from 'react-router-dom';
import { Loading } from '../loading';
import { Alert, AlertContent, AlertDescription, AlertTitle, Button, Card } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { useUsersServiceVerifyEmail, useUsersServiceGetCurrentKey, ApiError } from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { getTranslationKeyForApiError } from '../../utils/apiError';

export function VerifyEmail() {
  const query = useUrlQuery();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const { t, tExists } = useTranslations({ en, de });

  const token = useMemo(() => query.get('token'), [query]);
  const email = useMemo(() => query.get('email'), [query]);

  const queryClient = useQueryClient();
  const didSendRequest = useRef(false);

  const verifyEmail = useUsersServiceVerifyEmail({
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
      // Reset the ref so user can try again
      didSendRequest.current = false;
    },
  });

  const activateEmail = useCallback(() => {
    if (didSendRequest.current) {
      return;
    }

    if (!token || !email) {
      setError(t('apiErrors.invalidLink'));
      didSendRequest.current = true;
      return;
    }

    didSendRequest.current = true;
    verifyEmail.mutate({ requestBody: { token, email } });
  }, [token, email, t, verifyEmail]);

  useEffect(() => {
    // Only activate if we have both token and email
    if (token && email) {
      activateEmail();
    } else if (token !== null && email !== null) {
      // Both are defined but one is empty - show error immediately
      setError(t('apiErrors.invalidLink'));
      didSendRequest.current = true;
    }
  }, [activateEmail, token, email, t]);

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full" data-cy="verify-email-success-card">
          <Card.Header className="text-center">
            <h2 className="text-3xl font-bold">{t('success.title')}</h2>
          </Card.Header>
          <Card.Content>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center">{t('success.message')}</p>
          </Card.Content>
          <Card.Footer>
            <Button variant="primary" className="w-full" onPress={() => navigate('/')} data-cy="verify-email-success-login-button">
              {t('success.goToLogin')}
            </Button>
          </Card.Footer>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full" data-cy="verify-email-error-card">
          <Card.Header className="text-center">
            <h2 className="text-3xl font-bold">{t('error.title')}</h2>
          </Card.Header>
          <Card.Content>
            <Alert status="danger"
              data-cy="verify-email-error-alert"
            >
              <AlertContent>
                <AlertTitle>{t('error.errorTitle')}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </AlertContent>
            </Alert>
          </Card.Content>
          <Card.Footer className="flex flex-col gap-2">
            <Button variant="primary"
              className="w-full"
              onPress={activateEmail}
              isDisabled={verifyEmail.isPending}
              data-cy="verify-email-error-try-again-button"
            >
              {t('error.tryAgain')}
            </Button>
            <Button variant="outline"
              className="w-full"
              onPress={() => navigate('/')}
              data-cy="verify-email-error-back-to-login-button"
            >
              {t('error.backToLogin')}
            </Button>
          </Card.Footer>
        </Card>
      </div>
    );
  }

  return <Loading />;
}
