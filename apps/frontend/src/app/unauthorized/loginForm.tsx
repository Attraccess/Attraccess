import React, { useCallback, useMemo } from 'react';
import { ArrowRight, LogInIcon } from 'lucide-react';
import { Accordion, AccordionItem, AccordionHeading, AccordionTrigger, AccordionPanel, AccordionBody, AlertContent, AlertDescription, AlertTitle, Description, Input, Label, Skeleton, TextField } from '@heroui/react';
import { Button } from '@heroui/react';
import { Alert } from '@heroui/react';
import { TExists, TFunction, useTranslations } from '@attraccess/plugins-frontend-ui';
import { PasswordInput } from '../../components/PasswordInput';
import { useLogin } from '../../hooks/useAuth';
import en from './loginForm.en.json';
import de from './loginForm.de.json';
import { ApiError, useUsersServiceIsLocalSignupEnabled } from '@attraccess/react-query-client';
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
      const twoFactorCode = formData.get('twoFactorCode');

      if (typeof username !== 'string' || typeof password !== 'string') {
        return;
      }

      login({
        username,
        password,
        twoFactorCode: typeof twoFactorCode === 'string' ? twoFactorCode.trim() || undefined : undefined,
        tokenLocation: 'cookie',
      });
    },
    [login],
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
      <TextField isDisabled={isPending}>
        <Label>{t('twoFactorCode')}</Label>
        <Input id="twoFactorCode" name="twoFactorCode" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} data-cy="login-form-two-factor-input" />
        <Description>{t('twoFactorHelper')}</Description>
      </TextField>
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
    </form>
  );
}
