import { ArrowRight } from 'lucide-react';
import { Input, Label, TextField } from '@heroui/react';
import { OneTimeCodeInput } from '../../components/OneTimeCodeInput/index';
import { Button, PasswordInput, useTranslations } from '@attraccess/plugins-frontend-ui';
import { ApiError } from '@attraccess/react-query-client';
import API_ERROR_TRANSLATIONS_DE from '../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../global-translations/api-errors.en.json';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isValidEmail } from '../../utils/email';
import { useLogin } from '../../hooks/useAuth';
import { toApiErrorNotice } from './apiErrorNotice';
import { LoginErrorAlert } from './LoginErrorAlert';
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
  // Remounts the error card per attempt, so its resend field starts from the identifier just submitted.
  const [attempt, setAttempt] = useState(0);

  const isEmailNotVerified = useMemo(() => {
    if (!error) return false;
    const apiError = error as ApiError;
    const body = apiError?.body as Record<string, unknown> | undefined;
    return body?.message === 'UserEmailNotVerifiedException';
  }, [error]);

  const errorNotice = useMemo(
    () => (!error || errorMessage === 'TwoFactorRequired' ? null : toApiErrorNotice(error, t, tExists)),
    [error, errorMessage, t, tExists],
  );

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

      setAttempt((count) => count + 1);
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
      {errorNotice && (
        <LoginErrorAlert
          key={attempt}
          title={errorNotice.title}
          description={errorNotice.description}
          isEmailNotVerified={isEmailNotVerified}
          identifier={identifier}
          password={passwordValue}
          // The old address no longer signs in, so a typed email identifier follows the change.
          onEmailChanged={(newEmail) => setIdentifier((current) => (isValidEmail(current.trim()) ? newEmail : current))}
        />
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
    </form>
  );
}
