import { isValidEmail } from '../../utils/email';
import { LogInIcon, ArrowRight } from 'lucide-react';
import {
  Accordion,
  AccordionItem,
  AccordionHeading,
  AccordionTrigger,
  AccordionPanel,
  AccordionBody,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Input,
  Label,
  Skeleton,
  TextField,
  Alert,
} from '@heroui/react';
import { Button } from '../../components/button/index';
import { OneTimeCodeInput } from '../../components/OneTimeCodeInput/index';
import { TExists, TFunction, useTranslations } from '@attraccess/plugins-frontend-ui';
import { PasswordInput } from '../../components/PasswordInput/index';
import en from './loginForm.en.json';
import de from './loginForm.de.json';
import {
  useUsersServiceIsLocalSignupEnabled,
  ApiError,
  useUsersServiceResendVerificationEmail,
} from '@attraccess/react-query-client';
import API_ERROR_TRANSLATIONS_DE from '../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../global-translations/api-errors.en.json';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLogin } from '../../hooks/useAuth';
import { getTranslationKeyForApiError } from '../../utils/apiError';

export interface LoginFormProps {
  onNeedsAccount: (() => void) | null;
  onForgotPassword: () => void;
}

export function LoginFormHeader(props: LoginFormProps & { isLocalSignupEnabled: boolean; t: TFunction }) {
  const { onNeedsAccount, isLocalSignupEnabled, t } = props;

  return (
    <div>
      <h2 className="text-3xl font-bold">{t('title')}</h2>
      {isLocalSignupEnabled && onNeedsAccount && (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-600 dark:text-gray-300">
          <span>{t('noAccount')}</span>
          <Button variant="secondary" onPress={onNeedsAccount} data-cy="login-form-sign-up-button">
            {t('signUpButton')}
          </Button>
        </p>
      )}
    </div>
  );
}

export function useLoginFormContentState(props: LoginFormProps & { t: TFunction; tExists: TExists }) {
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
  return {
    onForgotPassword,
    t,
    isPending,
    twoFactorCode,
    setTwoFactorCode,
    resendEmail,
    setResendEmail,
    resendSuccess,
    resendError,
    setResendError,
    isEmailNotVerified,
    resendVerification,
    errorTitle,
    errorDescription,
    handleSubmit,
    arrowRight,
  } as const;
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
            <AccordionTrigger>
              <LogInIcon className="mr-2" />
              {t('accordion.title')}
            </AccordionTrigger>
          </AccordionHeading>
          <AccordionPanel>
            <AccordionBody>
              <LoginFormContent {...props} t={t} tExists={tExists} />
            </AccordionBody>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </>
  );
}

function LoginFormContent(props: LoginFormProps & { t: TFunction; tExists: TExists }) {
  const model = useLoginFormContentState(props);

  return (
    <form className="space-y-6" onSubmit={model.handleSubmit} data-cy="login-form">
      <TextField isDisabled={model.isPending}>
        <Label>{model.t('username')}</Label>
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
        label={model.t('password')}
        required
        isDisabled={model.isPending}
        data-cy="login-form-password-input"
        autoComplete="current-password"
      />
      {/* Value sourced purely from React state (twoFactorCode), not FormData. */}
      <OneTimeCodeInput
        label={model.t('twoFactorCode')}
        description={model.t('twoFactorHelper')}
        value={model.twoFactorCode}
        onChange={model.setTwoFactorCode}
        isDisabled={model.isPending}
        data-cy="login-form-two-factor-input"
      />
      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          onPress={model.onForgotPassword}
          isDisabled={model.isPending}
          data-cy="login-form-forgot-password-button"
        >
          {model.t('forgotPassword')}
        </Button>
      </div>
      <Button
        variant="primary"
        type="submit"
        className="w-full"
        isPending={model.isPending}
        isDisabled={model.isPending}
        data-cy="login-form-sign-in-button"
      >
        {model.isPending ? model.t('signingIn') : model.t('signInButton')}
        {model.arrowRight}
      </Button>

      {model.errorTitle && (
        <Alert status="danger" data-cy="login-form-error-alert">
          <AlertContent>
            <AlertTitle>{model.errorTitle}</AlertTitle>
            <AlertDescription>{model.errorDescription}</AlertDescription>
          </AlertContent>
        </Alert>
      )}

      {model.isEmailNotVerified && !model.resendSuccess && (
        <div className="space-y-2" data-testid="resend-verification-section">
          <p className="text-sm text-gray-600 dark:text-gray-400">{model.t('resendVerification.prompt')}</p>
          <TextField
            value={model.resendEmail}
            onChange={(value) => {
              model.setResendEmail(value);
              model.setResendError(null);
            }}
          >
            <Label>{model.t('resendVerification.emailLabel')}</Label>
            <Input type="email" data-testid="resend-email-input" />
          </TextField>
          {model.resendError && (
            <Alert status="danger" data-testid="resend-error-alert">
              <AlertContent>
                <AlertTitle>{model.resendError.title}</AlertTitle>
                <AlertDescription>{model.resendError.description}</AlertDescription>
              </AlertContent>
            </Alert>
          )}
          <Button
            variant="secondary"
            className="w-full"
            onPress={() => {
              const trimmed = model.resendEmail.trim();
              if (!isValidEmail(trimmed)) {
                return;
              }
              model.resendVerification.mutate({ requestBody: { email: trimmed } });
            }}
            isPending={model.resendVerification.isPending}
            isDisabled={!isValidEmail(model.resendEmail.trim()) || model.resendVerification.isPending}
            data-testid="resend-verification-button"
          >
            {model.t('resendVerification.button')}
          </Button>
        </div>
      )}

      {model.resendSuccess && (
        <Alert status="success" data-testid="resend-success-alert">
          <AlertContent>
            <AlertTitle>{model.t('resendVerification.successTitle')}</AlertTitle>
            <AlertDescription>{model.t('resendVerification.successMessage')}</AlertDescription>
          </AlertContent>
        </Alert>
      )}
    </form>
  );
}
