import React, { useCallback, useMemo } from 'react';
import { ArrowRight, LogInIcon } from 'lucide-react';
import { Accordion, AccordionItem, Input, Skeleton } from '@heroui/react';
import { Button } from '@heroui/react';
import { Alert } from '@heroui/react';
import { TFunction, useTranslations } from '@attraccess/plugins-frontend-ui';
import { PasswordInput } from '../../components/PasswordInput';
import { useLogin } from '../../hooks/useAuth';
import en from './loginForm.en.json';
import de from './loginForm.de.json';
import { useUsersServiceIsLocalSignupEnabled } from '@attraccess/react-query-client';

interface LoginFormProps {
  onNeedsAccount: () => void;
  onForgotPassword: () => void;
}

export function LoginForm(props: LoginFormProps) {
  const { data: isLocalSignupEnabled, isLoading } = useUsersServiceIsLocalSignupEnabled();

  const { t } = useTranslations({
    en,
    de,
  });

  if (isLoading) {
    return <Skeleton className="w-full h-10" />;
  }

  if (isLocalSignupEnabled?.value) {
    return (
      <>
        <LoginFormHeader {...props} isLocalSignupEnabled={isLocalSignupEnabled.value} t={t} />
        <LoginFormContent {...props} t={t} />
      </>
    );
  }

  return (
    <>
      <LoginFormHeader {...props} isLocalSignupEnabled={isLocalSignupEnabled?.value ?? false} t={t} />
      <Accordion variant="splitted" className="w-full">
        <AccordionItem title={t('accordion.title')} indicator={<LogInIcon />} className="bg-default-100">
          <LoginFormContent {...props} t={t} />
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
          <Button onPress={onNeedsAccount} variant="light" color="secondary" data-cy="login-form-sign-up-button">
            {t('signUpButton')}
          </Button>
        </p>
      )}
    </div>
  );
}

function LoginFormContent(props: LoginFormProps & { t: TFunction }) {
  const { onForgotPassword, t } = props;

  const { mutate: login, isPending, error } = useLogin();

  const handleSubmit: React.FormEventHandler = useCallback(
    async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget as HTMLFormElement);
      const username = formData.get('username');
      const password = formData.get('password');

      if (typeof username !== 'string' || typeof password !== 'string') {
        return;
      }

      login({
        username,
        password,
        tokenLocation: 'cookie',
      });
    },
    [login],
  );

  const memoizedArrowRight = useMemo(
    () => <ArrowRight className="group-hover:translate-x-1 transition-transform" />,
    [],
  );

  return (
    <form className="space-y-6" onSubmit={handleSubmit} data-cy="login-form">
      <Input
        id="username"
        name="username"
        type="text"
        label={t('username')}
        variant="underlined"
        required
        isDisabled={isPending}
        data-cy="login-form-username-input"
        autoComplete="username"
      />
      <PasswordInput
        id="password"
        name="password"
        label={t('password')}
        variant="underlined"
        required
        isDisabled={isPending}
        data-cy="login-form-password-input"
        autoComplete="current-password"
      />
      <div className="flex items-center justify-between">
        <Button
          onPress={onForgotPassword}
          variant="light"
          color="secondary"
          isDisabled={isPending}
          data-cy="login-form-forgot-password-button"
        >
          {t('forgotPassword')}
        </Button>
      </div>
      <Button
        type="submit"
        fullWidth
        color="primary"
        endContent={memoizedArrowRight}
        isLoading={isPending}
        isDisabled={isPending}
        data-cy="login-form-sign-in-button"
      >
        {isPending ? t('signingIn') : t('signInButton')}
      </Button>

      {(error as Error) && (
        <Alert
          color="danger"
          title={t('error.title')}
          description={(error as Error).message}
          data-cy="login-form-error-alert"
        />
      )}
    </form>
  );
}
