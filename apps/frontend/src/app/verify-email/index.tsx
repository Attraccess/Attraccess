import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUrlQuery } from '@attraccess/plugins-frontend-ui';
import { useNavigate } from 'react-router-dom';
import { Loading } from '../loading';
import { Alert, Button, Card, CardBody, CardFooter, CardHeader, Input, Spacer } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import {
  useUsersServiceVerifyEmail,
  useUsersServiceResendVerificationEmail,
  useUsersServiceGetCurrentKey,
  ApiError,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { getTranslationKeyForApiError } from '../../utils/apiError';

export function VerifyEmail() {
  const query = useUrlQuery();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [resendSuccess, setResendSuccess] = useState(false);
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
      didSendRequest.current = false;
    },
  });

  const resendVerification = useUsersServiceResendVerificationEmail({
    onSuccess: () => {
      setResendSuccess(true);
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
    if (token && email) {
      activateEmail();
      setResendEmail(email);
    } else if (token !== null && email !== null) {
      setError(t('apiErrors.invalidLink'));
      didSendRequest.current = true;
    }
  }, [activateEmail, token, email, t]);

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full" data-cy="verify-email-success-card">
          <CardHeader className="text-center">
            <h2 className="text-3xl font-bold">{t('success.title')}</h2>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center">{t('success.message')}</p>
          </CardBody>
          <CardFooter>
            <Button fullWidth color="primary" onPress={() => navigate('/')} data-cy="verify-email-success-login-button">
              {t('success.goToLogin')}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full" data-cy="verify-email-error-card">
          <CardHeader className="text-center">
            <h2 className="text-3xl font-bold">{t('error.title')}</h2>
          </CardHeader>
          <CardBody className="gap-4">
            <Alert
              color="danger"
              title={t('error.errorTitle')}
              description={error}
              data-cy="verify-email-error-alert"
            />

            {resendSuccess ? (
              <Alert
                color="success"
                title={t('resend.successTitle')}
                description={t('resend.successMessage')}
                data-testid="resend-success-alert"
              />
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('resend.prompt')}</p>
                <Input
                  type="email"
                  label={t('resend.emailLabel')}
                  value={resendEmail}
                  onValueChange={setResendEmail}
                  data-testid="resend-email-input"
                />
                <Button
                  fullWidth
                  color="secondary"
                  onPress={() => resendVerification.mutate({ requestBody: { email: resendEmail } })}
                  isLoading={resendVerification.isPending}
                  isDisabled={!resendEmail || resendVerification.isPending}
                  data-testid="resend-verification-button"
                >
                  {t('resend.button')}
                </Button>
              </div>
            )}
          </CardBody>
          <CardFooter>
            <Button
              fullWidth
              color="primary"
              onPress={activateEmail}
              isDisabled={verifyEmail.isPending}
              data-cy="verify-email-error-try-again-button"
            >
              {t('error.tryAgain')}
            </Button>
            <Spacer y={2} />
            <Button
              fullWidth
              variant="bordered"
              onPress={() => navigate('/')}
              data-cy="verify-email-error-back-to-login-button"
            >
              {t('error.backToLogin')}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return <Loading />;
}
