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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLogin } from '../../hooks/useAuth';
import { getTranslationKeyForApiError } from '../../utils/apiError';

export interface LoginFormProps {
  onNeedsAccount: (() => void) | null;
  onForgotPassword: () => void;
}

function getLoginErrorMessage(error: unknown): string | undefined {
  const body = (error as ApiError | null)?.body as Record<string, unknown> | undefined;
  return typeof body?.message === 'string' ? body.message : undefined;
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

    return {
      errorTitle: t(key + '.title', { error }),
      errorDescription: t(key + '.description', {
        error,
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

  return {
    onForgotPassword,
    t,
    isPending,
    formRef,
    identifier,
    setIdentifier,
    passwordValue,
    setPasswordValue,
    challengeCredentials,
    changeCredentials,
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
    <form ref={model.formRef} className="space-y-6" onSubmit={model.handleSubmit} data-cy="login-form">
      <TextField
        value={model.identifier}
        onChange={model.setIdentifier}
        isDisabled={model.isPending}
        isReadOnly={!!model.challengeCredentials}
      >
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
        value={model.passwordValue}
        onChange={model.setPasswordValue}
        required
        isDisabled={model.isPending}
        isReadOnly={!!model.challengeCredentials}
        data-cy="login-form-password-input"
        autoComplete="current-password"
      />
      {model.challengeCredentials && (
        <fieldset aria-label={model.t('twoFactorCode')} className="space-y-2">
          <p>{model.t('twoFactorInstruction')}</p>
          <OneTimeCodeInput
            label={model.t('twoFactorCode')}
            name="twoFactorCode"
            value={model.twoFactorCode}
            onChange={model.setTwoFactorCode}
            isDisabled={model.isPending}
            autoFocus
            data-cy="login-form-two-factor-input"
          />
          <Button variant="secondary" onPress={model.changeCredentials} isDisabled={model.isPending}>
            {model.t('changeCredentials')}
          </Button>
        </fieldset>
      )}
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
        isDisabled={model.isPending || (!!model.challengeCredentials && !/^\d{6}$/.test(model.twoFactorCode))}
        data-cy="login-form-sign-in-button"
      >
        {model.isPending
          ? model.t('signingIn')
          : model.challengeCredentials
            ? model.t('verifyCode')
            : model.t('signInButton')}
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
