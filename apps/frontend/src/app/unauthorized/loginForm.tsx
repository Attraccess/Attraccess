import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { isValidEmail } from '../../utils/email';
import { ArrowRight, LogInIcon } from 'lucide-react';
import { Accordion, AccordionItem, AccordionHeading, AccordionTrigger, AccordionPanel, AccordionBody, AlertContent, AlertDescription, AlertTitle, Input, Label, Skeleton, TextField } from '@heroui/react';
import { Button } from '../../components/button';
import { OneTimeCodeInput } from '../../components/OneTimeCodeInput';
import { Alert } from '@heroui/react';
import { TExists, TFunction, useTranslations } from '@attraccess/plugins-frontend-ui';
import { PasswordInput } from '../../components/PasswordInput';
import { useLogin } from '../../hooks/useAuth';
import en from './loginForm.en.json';
import de from './loginForm.de.json';
import {
  ApiError,
  useUsersServiceIsLocalSignupEnabled,
  useUsersServiceResendVerificationEmail,
} from '@attraccess/react-query-client';
import API_ERROR_TRANSLATIONS_DE from '../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../global-translations/api-errors.en.json';
import { getTranslationKeyForApiError } from '../../utils/apiError';

interface LoginFormProps {
  onNeedsAccount: () => void;
  onForgotPassword: () => void;
}

export function LoginForm(props: LoginFormProps) {
  const { data: isLocalSignupEnabled, isLoading } = useUsersServiceIsLocalSignupEnabled();

  const { t, tExists } = useTranslations({
    en: {
      ...en,
      api: API_ERROR_TRANSLATIONS_EN,
    },
    de: {
      ...de,
      api: API_ERROR_TRANSLATIONS_DE,
    },
  });

  if (isLoading) {
    return <Skeleton className="w-full h-10" />;
  }

  if (isLocalSignupEnabled?.value) {
    return (
      <>
        <LoginFormHeader {...props} isLocalSignupEnabled={isLocalSignupEnabled.value} t={t} />
        <LoginFormContent {...props} t={t} tExists={tExists} />
      </>
    );
  }

  return (
    <>
      <LoginFormHeader {...props} isLocalSignupEnabled={isLocalSignupEnabled?.value ?? false} t={t} />
      <Accordion variant="default" className="w-full">
        <AccordionItem className="bg-default-100">
          <AccordionHeading>
            <AccordionTrigger><LogInIcon className="mr-2" />{t('accordion.title')}</AccordionTrigger>
          </AccordionHeading>
          <AccordionPanel><AccordionBody>
            <LoginFormContent {...props} t={t} tExists={tExists} />
          </AccordionBody></AccordionPanel>
        </AccordionItem>
      </Accordion>
    </>
  );
}

function LoginFormHeader(props: LoginFormProps & { isLocalSignupEnabled: boolean; t: TFunction }) {
  const { onNeedsAccount, isLocalSignupEnabled, t } = props;

  return (
    <div>
      <h2 className="text-3xl font-bold">{t('title')}</h2>
      {isLocalSignupEnabled && (
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          {t('noAccount')}{' '}
          <Button variant="secondary" onPress={onNeedsAccount} data-cy="login-form-sign-up-button">
            {t('signUpButton')}
          </Button>
        </p>
      )}
    </div>
  );
}

function LoginFormContent(props: LoginFormProps & { t: TFunction; tExists: TExists }) {
  const { onForgotPassword, t, tExists } = props;

  const { mutate: login, isPending, error } = useLogin();
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
    if (!error) {
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

    return {
      errorTitle: t(key + '.title', { error }),
      errorDescription: t(key + '.description', {
        error,
      }),
    };
  }, [error, t, tExists]);

  const handleSubmit: React.FormEventHandler = useCallback(
    async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget as HTMLFormElement);
      const username = formData.get('username');
      const password = formData.get('password');

      if (typeof username !== 'string' || typeof password !== 'string') {
        return;
      }

      setResendSuccess(false);
      setResendError(null);

      login({
        username,
        password,
        twoFactorCode: twoFactorCode.trim() || undefined,
        tokenLocation: 'cookie',
      });
    },
    [login, twoFactorCode],
  );

  const arrowRight = <ArrowRight className="group-hover:translate-x-1 transition-transform" />;

  return (
    <form className="space-y-6" onSubmit={handleSubmit} data-cy="login-form">
      <TextField isDisabled={isPending}>
        <Label>{t('username')}</Label>
        <Input id="username" name="username" type="text" required autoComplete="username" data-cy="login-form-username-input" />
      </TextField>
      <PasswordInput
        id="password"
        name="password"
        label={t('password')}
        required
        isDisabled={isPending}
        data-cy="login-form-password-input"
        autoComplete="current-password"
      />
      {/* Value sourced purely from React state (twoFactorCode), not FormData. */}
      <OneTimeCodeInput
        label={t('twoFactorCode')}
        description={t('twoFactorHelper')}
        value={twoFactorCode}
        onChange={setTwoFactorCode}
        isDisabled={isPending}
        data-cy="login-form-two-factor-input"
      />
      <div className="flex items-center justify-between">
        <Button variant="secondary"
          onPress={onForgotPassword}
          isDisabled={isPending}
          data-cy="login-form-forgot-password-button"
        >
          {t('forgotPassword')}
        </Button>
      </div>
      <Button variant="primary"
        type="submit"
        className="w-full"
        isPending={isPending}
        isDisabled={isPending}
        data-cy="login-form-sign-in-button"
      >
        {isPending ? t('signingIn') : t('signInButton')}
        {arrowRight}</Button>

      {errorTitle && (
        <Alert status="danger" data-cy="login-form-error-alert" >
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
