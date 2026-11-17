import { isValidEmail } from '../../utils/email';
import { ArrowRight } from 'lucide-react';
import { AlertContent, AlertDescription, AlertTitle, Input, Label, TextField, Alert } from '@heroui/react';
import { OneTimeCodeInput } from '../../components/OneTimeCodeInput/index';
import { Button, PasswordInput, useTranslations } from '@attraccess/plugins-frontend-ui';
import { ApiError, useUsersServiceResendVerificationEmail } from '@attraccess/react-query-client';
import API_ERROR_TRANSLATIONS_DE from '../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../global-translations/api-errors.en.json';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLogin } from '../../hooks/useAuth';
import { getTranslationKeyForApiError } from '../../utils/apiError';
import en from './loginForm.en.json';
import de from './loginForm.de.json';

function getLoginErrorMessage(error: unknown): string | undefined {
  const body = (error as ApiError | null)?.body as Record<string, unknown> | undefined;
  return typeof body?.message === 'string' ? body.message : undefined;
}

export function LoginFormContent(props: Readonly<{ onForgotPassword: () => void }>) {
  const { onForgotPassword } = props;
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });

  const { mutate: login, isPending, error, reset } = useLogin();
  const [identifier, setIdentifier] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [challengeCredentials, setChallengeCredentials] = useState<{ username: string; password: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const errorMessage = getLoginErrorMessage(error);

  useEffect(() => {
    if (challengeCredentials && !isPending) {
      formRef.current?.querySelector<HTMLInputElement>('input[name="twoFactorCode"]')?.focus();
    }
  }, [challengeCredentials, isPending]);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState<{ title: string; description: string } | null>(null);

  const isEmailNotVerified = useMemo(() => {
    if (!error) return false;
    const apiError = error as ApiError;
    const body = apiError?.body as Record<string, unknown> | undefined;
    return body?.message === 'UserEmailNotVerifiedException';
  }, [error]);

  useEffect(() => {
    setResendSuccess(false);
    setResendError(null);
    setResendEmail('');
  }, [error]);

  const resendVerification = useUsersServiceResendVerificationEmail({
    onSuccess: () => {
      setResendError(null);
      setResendSuccess(true);
    },
    onError: (mutationError) => {
      setResendSuccess(false);
      const { key } = getTranslationKeyForApiError({
        error: mutationError as ApiError,
        t,
        tExists,
        baseTranslationKey: 'api',
        fallbackKey: 'generic',
      });
      setResendError({
        title: t(key + '.title', { error: mutationError }),
        description: t(key + '.description', { error: mutationError }),
      });
    },
  });

  const { errorTitle, errorDescription } = useMemo(() => {
    if (!error || errorMessage === 'TwoFactorRequired') {
      return {
        errorTitle: null,
        errorDescription: null,
      };
    }

    const { key } = getTranslationKeyForApiError({
      error: error as ApiError,
      t,
      tExists,
      baseTranslationKey: 'api',
      fallbackKey: 'generic',
    });

    const responseBody = (error as ApiError).body as Record<string, unknown> | undefined;
    const retryAfterSeconds = Number(responseBody?.retryAfterSeconds);
    const retryAfter = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : undefined;

    return {
      errorTitle: t(key + '.title', { error }),
      errorDescription: t(key + '.description', {
        error,
        retryAfterSeconds: retryAfter ?? '',
      }),
    };
  }, [error, errorMessage, t, tExists]);

  const changeCredentials = useCallback(() => {
    if (isPending || submitting.current) return;
    setChallengeCredentials(null);
    setTwoFactorCode('');
    reset();
    formRef.current?.querySelector<HTMLInputElement>('input[name="username"]')?.focus();
  }, [isPending, reset]);

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = useCallback(
    (event) => {
      event.preventDefault();
      if (isPending || submitting.current) return;
      if (challengeCredentials && !/^\d{6}$/.test(twoFactorCode)) return;

      // Read actual inputs before disabling them, including password-manager autofill.
      const formData = new FormData(event.currentTarget);
      const username = formData.get('username');
      const password = formData.get('password');
      if (typeof username !== 'string' || typeof password !== 'string') return;
      const credentials = challengeCredentials ?? { username, password };
      // Keep native autofill visible when the pending/challenge state rerenders the fields.
      setIdentifier(credentials.username);
      setPasswordValue(credentials.password);

      setResendSuccess(false);
      setResendError(null);
      submitting.current = true;
      login(
        {
          ...credentials,
          ...(challengeCredentials ? { twoFactorCode } : {}),
          tokenLocation: 'cookie',
        },
        {
          onError: (mutationError) => {
            const message = getLoginErrorMessage(mutationError);
            if (message === 'TwoFactorRequired') {
              setChallengeCredentials(credentials);
            } else if (
              [
                'UnkownUserOrPasswordException',
                'UserEmailNotVerifiedException',
                'LOCAL_LOGIN_FOR_SSO_FORBIDDEN',
              ].includes(message ?? '')
            ) {
              setChallengeCredentials(null);
              setTwoFactorCode('');
            }
          },
          onSuccess: () => {
            setChallengeCredentials(null);
            setIdentifier('');
            setPasswordValue('');
            setTwoFactorCode('');
          },
          onSettled: () => {
            submitting.current = false;
          },
        },
      );
    },
    [login, isPending, challengeCredentials, twoFactorCode],
  );

  const arrowRight = <ArrowRight className="group-hover:translate-x-1 transition-transform" />;

  return (
    <form ref={formRef} className="space-y-6" onSubmit={handleSubmit} data-cy="login-form">
      <TextField value={identifier} onChange={setIdentifier} isDisabled={isPending} isReadOnly={!!challengeCredentials}>
        <Label>{t('username')}</Label>
        <Input
          id="username"
          name="username"
          type="text"
          required
          autoComplete="username"
          data-cy="login-form-username-input"
        />
      </TextField>
      <PasswordInput
        id="password"
        name="password"
        label={t('password')}
        value={passwordValue}
        onChange={setPasswordValue}
        required
        isDisabled={isPending}
        isReadOnly={!!challengeCredentials}
        data-cy="login-form-password-input"
        autoComplete="current-password"
      />
      {challengeCredentials && (
        <fieldset aria-label={t('twoFactorCode')} className="space-y-2">
          <p>{t('twoFactorInstruction')}</p>
          <OneTimeCodeInput
            label={t('twoFactorCode')}
            name="twoFactorCode"
            value={twoFactorCode}
            onChange={setTwoFactorCode}
            isDisabled={isPending}
            autoFocus
            data-cy="login-form-two-factor-input"
          />
          <Button variant="secondary" onPress={changeCredentials} isDisabled={isPending}>
            {t('changeCredentials')}
          </Button>
        </fieldset>
      )}
      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          onPress={onForgotPassword}
          isDisabled={isPending}
          data-cy="login-form-forgot-password-button"
        >
          {t('forgotPassword')}
        </Button>
      </div>
      <Button
        variant="primary"
        type="submit"
        className="w-full"
        isPending={isPending}
        isDisabled={isPending || (!!challengeCredentials && !/^\d{6}$/.test(twoFactorCode))}
        data-cy="login-form-sign-in-button"
      >
        {challengeCredentials ? t('verifyCode') : t('signInButton')}
        {arrowRight}
      </Button>

      {errorTitle && (
        <Alert status="danger" data-cy="login-form-error-alert">
          <AlertContent>
            <AlertTitle>{errorTitle}</AlertTitle>
            <AlertDescription>{errorDescription}</AlertDescription>
          </AlertContent>
        </Alert>
      )}

      {isEmailNotVerified && !resendSuccess && (
        <div className="space-y-2" data-testid="resend-verification-section">
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('resendVerification.prompt')}</p>
          <TextField
            value={resendEmail}
            onChange={(value) => {
              setResendEmail(value);
              setResendError(null);
            }}
          >
            <Label>{t('resendVerification.emailLabel')}</Label>
            <Input type="email" data-testid="resend-email-input" />
          </TextField>
          {resendError && (
            <Alert status="danger" data-testid="resend-error-alert">
              <AlertContent>
                <AlertTitle>{resendError.title}</AlertTitle>
                <AlertDescription>{resendError.description}</AlertDescription>
              </AlertContent>
            </Alert>
          )}
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
            {t('resendVerification.button')}
          </Button>
        </div>
      )}

      {resendSuccess && (
        <Alert status="success" data-testid="resend-success-alert">
          <AlertContent>
            <AlertTitle>{t('resendVerification.successTitle')}</AlertTitle>
            <AlertDescription>{t('resendVerification.successMessage')}</AlertDescription>
          </AlertContent>
        </Alert>
      )}
    </form>
  );
}
