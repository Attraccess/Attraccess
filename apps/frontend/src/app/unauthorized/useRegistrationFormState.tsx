import React, { useCallback, useMemo, useState } from 'react';
import { useOverlayState } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { USERNAME_RULES, useUsernameValidation } from '../../components/UsernameInput';
import en from './registrationForm.en.json';
import de from './registrationForm.de.json';
import {
  useUsersServiceCreateOneUser,
  useUsersServiceFindManyKey,
  usePasswordPolicyServiceGetPublicPasswordPolicy,
  ApiError,
  AuthenticationType,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import API_ERROR_TRANSLATIONS_DE from '../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../global-translations/api-errors.en.json';
import { useToastMessage } from '../../components/toastProvider';
import { PolicyError, PublicPasswordPolicy, validatePassword } from '@attraccess/shared';
import { extractPolicyErrors } from '../../utils/policyErrors';
import { RegisterFormProps } from './registrationForm.register-form-props';
import { FALLBACK_POLICY } from './registrationForm.fallback-policy';
export function useRegistrationFormState({ onHasAccount }: RegisterFormProps) {
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
  const [registeredEmail, setRegisteredEmail] = useState<string>('');
  const { isOpen, open, setOpen } = useOverlayState();
  const toast = useToastMessage();

  const [username, setUsername] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [passwordConfirmation, setPasswordConfirmation] = useState<string>('');
  const [serverErrors, setServerErrors] = useState<PolicyError[]>([]);

  const { data: policyData } = usePasswordPolicyServiceGetPublicPasswordPolicy();
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

  const { mutate: createUserMutate, isPending } = useUsersServiceCreateOneUser({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [useUsersServiceFindManyKey],
      });
      setServerErrors([]);
      open();
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
      setRegisteredEmail(trimmedEmail);
      createUserMutate({
        requestBody: {
          username: trimmedUsername,
          password,
          email: trimmedEmail,
          strategy: AuthenticationType.LOCAL_PASSWORD,
        },
      });
    },
    [canSubmit, createUserMutate, password, trimmedEmail, trimmedUsername],
  );

  const markTwoFactorSetupIntent = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    sessionStorage.setItem('twoFactorSetupIntent', 'true');
  }, []);
  return {
    t,
    registeredEmail,
    isOpen,
    setOpen,
    username,
    setUsername,
    email,
    setEmail,
    password,
    setPassword,
    passwordConfirmation,
    setPasswordConfirmation,
    serverErrors,
    setServerErrors,
    policy,
    usernameValidationMessages,
    trimmedUsername,
    trimmedEmail,
    canSubmit,
    isPending,
    handleSubmit,
    markTwoFactorSetupIntent,
    onHasAccount,
  } as const;
}
