import { ArrowRight } from 'lucide-react';
import { Input, Label, TextField } from '@heroui/react';
import { UsernameInput, USERNAME_RULES, useUsernameValidation } from '../../components/UsernameInput/index';
import { PasswordField } from '../../components/PasswordField/index';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './registrationForm.en.json';
import de from './registrationForm.de.json';
import {
  useCreateOneUser,
  useFindManyKey,
  useGetPublicPasswordPolicy,
  ApiError,
  AuthenticationType,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import API_ERROR_TRANSLATIONS_DE from '../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../global-translations/api-errors.en.json';
import { useToastMessage } from '../../components/toastProvider';
import { PolicyError, PublicPasswordPolicy, validatePassword } from '@attraccess/shared';
import { extractPolicyErrors } from '../../utils/policyErrors';
import { RegistrationConfirmation } from './RegistrationConfirmation';

export interface RegisterFormProps {
  onHasAccount: () => void;
}

export const FALLBACK_POLICY: PublicPasswordPolicy = {
  minLength: 12,
  maxLength: 128,
  allowAllUnicode: true,
  requireUppercase: false,
  requireLowercase: false,
  requireDigit: false,
  requireSpecial: false,
  minZxcvbnScore: 3,
};

export function RegistrationForm({ onHasAccount }: RegisterFormProps) {
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

  const queryClient = useQueryClient();
  // Held in memory only: the confirmation screen needs them to prove the account when the address is changed.
  const [registered, setRegistered] = useState<{ email: string; username: string; password: string } | null>(null);
  // What the request was sent with: the fields stay editable while it runs.
  const submitted = useRef<{ email: string; username: string; password: string } | null>(null);
  const toast = useToastMessage();

  const [username, setUsername] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [passwordConfirmation, setPasswordConfirmation] = useState<string>('');
  const [serverErrors, setServerErrors] = useState<PolicyError[]>([]);

  const { data: policyData } = useGetPublicPasswordPolicy();
  const policy = useMemo<PublicPasswordPolicy>(
    () => (policyData as PublicPasswordPolicy | undefined) ?? FALLBACK_POLICY,
    [policyData],
  );

  const passwordsDontMatch = useMemo(() => {
    if (!password || !passwordConfirmation) {
      return false;
    }
    return password !== passwordConfirmation;
  }, [password, passwordConfirmation]);

  const usernameValidationMessages = useMemo(
    () => ({
      length: t('usernameValidation.length', {
        min: USERNAME_RULES.minLength,
        max: USERNAME_RULES.maxLength,
      }),
      format: t('usernameValidation.format'),
    }),
    [t],
  );

  const { trimmed: trimmedUsername, isValid: isUsernameValid } = useUsernameValidation(
    username,
    usernameValidationMessages,
  );
  const trimmedEmail = useMemo(() => email.trim(), [email]);

  const localPolicyResult = useMemo(
    () =>
      validatePassword(
        password,
        {
          ...policy,
          checkHIBP: false,
          checkCommonPasswords: false,
          historySize: 0,
          rotationDays: 0,
        },
        { username: trimmedUsername, email: trimmedEmail },
      ),
    [password, policy, trimmedUsername, trimmedEmail],
  );

  const canSubmit = useMemo(
    () =>
      isUsernameValid &&
      !!trimmedEmail &&
      password.length > 0 &&
      passwordConfirmation.length > 0 &&
      !passwordsDontMatch &&
      localPolicyResult.ok,
    [isUsernameValid, trimmedEmail, password, passwordConfirmation, passwordsDontMatch, localPolicyResult.ok],
  );

  const { mutate: createUserMutate, isPending } = useCreateOneUser(undefined, {
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [useFindManyKey],
      });
      setServerErrors([]);
      setRegistered(submitted.current);
    },
    onError: (error) => {
      const policyErrors = extractPolicyErrors(error);
      if (policyErrors) {
        setServerErrors(policyErrors);
        return;
      }
      setServerErrors([]);
      toast.apiError({
        error: error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'api',
      });
    },
  });

  const handleSubmit: React.FormEventHandler = useCallback(
    async (event) => {
      event.preventDefault();
      if (!canSubmit) {
        return;
      }
      setServerErrors([]);
      submitted.current = { email: trimmedEmail, username: trimmedUsername, password };
      createUserMutate({
        body: {
          username: trimmedUsername,
          password,
          email: trimmedEmail,
          strategy: AuthenticationType.LOCAL_PASSWORD,
        },
      });
    },
    [canSubmit, createUserMutate, password, trimmedEmail, trimmedUsername],
  );

  if (registered) {
    return <RegistrationConfirmation {...registered} onBackToSignIn={onHasAccount} />;
  }

  return (
    <>
      <div>
        <h2 className="text-3xl font-bold">{t('title')}</h2>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          {t('hasAccount')}{' '}
          <Button variant="secondary" onPress={onHasAccount} data-cy="registration-form-sign-in-button">
            {t('signInButton')}
          </Button>
        </p>
      </div>

      <form className="mt-8 space-y-6" onSubmit={handleSubmit} data-cy="registration-form">
        <UsernameInput
          id="username"
          name="username"
          label={t('username')}
          description={t('usernameDescription', {
            min: USERNAME_RULES.minLength,
            max: USERNAME_RULES.maxLength,
          })}
          validationMessages={usernameValidationMessages}
          value={username}
          onChange={setUsername}
          data-cy="registration-form-username-input"
          isRequired
        />

        <TextField isRequired value={email} onChange={setEmail}>
          <Label>{t('email')}</Label>
          <Input id="email" name="email" type="email" required data-cy="registration-form-email-input" />
        </TextField>

        <PasswordField
          value={password}
          onValueChange={(v) => {
            setPassword(v);
            setServerErrors([]);
          }}
          username={trimmedUsername}
          email={trimmedEmail}
          policy={policy}
          serverErrors={serverErrors}
          passwordLabel={t('password')}
          confirmationLabel={t('passwordConfirmation')}
          showConfirmation
          confirmationValue={passwordConfirmation}
          onConfirmationChange={setPasswordConfirmation}
          isRequired
          autoComplete="new-password"
          dataCyPrefix="registration-form"
        />

        <Button
          variant="primary"
          className="w-full"
          type="submit"
          isPending={isPending}
          isDisabled={!canSubmit}
          data-cy="registration-form-create-account-button"
        >
          {t('createAccountButton')}
          <ArrowRight className="group-hover:translate-x-1 transition-transform" />
        </Button>
      </form>
    </>
  );
}
