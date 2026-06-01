import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isValidEmail } from '../../utils/email';
import { useUrlQuery } from '@attraccess/plugins-frontend-ui';
import { useNavigate } from 'react-router-dom';
import { Loading } from '../loading';
import { Alert, AlertContent, AlertDescription, AlertTitle, Card, Input, Label, TextField } from '@heroui/react';
import { Button } from '../../components/button';
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
          <Card.Content className="flex flex-col gap-4">
            <Alert status="danger" data-cy="verify-email-error-alert">
              <AlertContent>
                <AlertTitle>{t('error.errorTitle')}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </AlertContent>
            </Alert>

            {resendSuccess ? (
              <Alert status="success" data-testid="resend-success-alert">
                <AlertContent>
                  <AlertTitle>{t('resend.successTitle')}</AlertTitle>
                  <AlertDescription>{t('resend.successMessage')}</AlertDescription>
                </AlertContent>
              </Alert>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('resend.prompt')}</p>
                <TextField value={resendEmail} onChange={setResendEmail}>
                  <Label>{t('resend.emailLabel')}</Label>
                  <Input type="email" data-testid="resend-email-input" />
                </TextField>
                <Button
                  variant="secondary"
                  className="w-full"
                  onPress={() => {
                    const trimmed = resendEmail.trim();
                    if (!isValidEmail(trimmed)) {
                      return;
                    }
                    resendVerification.mutate({ requestBody: { email: trimmed } });
                  }}
                  isPending={resendVerification.isPending}
                  isDisabled={!isValidEmail(resendEmail.trim()) || resendVerification.isPending}
                  data-testid="resend-verification-button"
                >
                  {t('resend.button')}
                </Button>
              </div>
            )}
          </Card.Content>
          <Card.Footer className="flex flex-col gap-2">
            <Button
              variant="primary"
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
