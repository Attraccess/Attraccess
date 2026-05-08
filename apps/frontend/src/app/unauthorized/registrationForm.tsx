import React, { useCallback, useMemo, useState } from 'react';
import { Modal, ModalContent, useDisclosure } from '../../utils/heroui-compat';
import { ArrowRight, Mail } from 'lucide-react';
import { Alert, Input } from '@heroui/react';
import { Button } from '@heroui/react';
import { ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PasswordInput } from '../../components/PasswordInput';
import { UsernameInput, USERNAME_RULES, useUsernameValidation } from '../../components/UsernameInput';
import en from './registrationForm.en.json';
import de from './registrationForm.de.json';
import {
  useUsersServiceCreateOneUser,
  useUsersServiceFindManyKey,
  ApiError,
  AuthenticationType,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import API_ERROR_TRANSLATIONS_DE from '../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../global-translations/api-errors.en.json';
import { useToastMessage } from '../../components/toastProvider';

interface RegisterFormProps {
  onHasAccount: () => void;
}

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
  const [registeredEmail, setRegisteredEmail] = useState<string>('');
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const toast = useToastMessage();

  const [username, setUsername] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string | null>(null);
  const [passwordConfirmation, setPasswordConfirmation] = useState<string | null>(null);

  const passwordsDontMatch = useMemo(() => {
    if (password === null || passwordConfirmation === null) {
      return false;
    }

    return password !== passwordConfirmation;
  }, [password, passwordConfirmation]);

  const passwordTooShort = useMemo(() => {
    if (password === null) {
      return false;
    }

    return password.length < 8;
  }, [password]);

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

  const canSubmit = useMemo(
    () =>
      isUsernameValid &&
      !!trimmedEmail &&
      password !== null &&
      passwordConfirmation !== null &&
      !passwordTooShort &&
      !passwordsDontMatch,
    [isUsernameValid, trimmedEmail, password, passwordConfirmation, passwordTooShort, passwordsDontMatch],
  );

  const { mutate: createUserMutate, isPending } = useUsersServiceCreateOneUser({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [useUsersServiceFindManyKey],
      });
      onOpen();
    },
    onError: (error) => {
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

      if (!canSubmit || password === null) {
        return;
      }

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

  return (
    <>
      <div>
        <h2 className="text-3xl font-bold">{t('title')}</h2>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          {t('hasAccount')}{' '}
          <Button onPress={onHasAccount} variant="light" color="secondary" data-cy="registration-form-sign-in-button">
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
          onValueChange={setUsername}
          required

          data-cy="registration-form-username-input"
          isRequired
        />

        <Input
          id="email"
          name="email"
          type="email"
          label={t('email')}
          required

          data-cy="registration-form-email-input"
          isRequired
          value={email}
          onValueChange={setEmail}
        />

        <PasswordInput
          id="password"
          name="password"
          label={t('password')}
          required
          data-cy="registration-form-password-input"
          autoComplete="new-password"
          isRequired
          validate={() => {
            if (passwordTooShort) {
              return t('validationError.passwordTooShort');
            }
            return true;
          }}
          value={password ?? ''}
          onValueChange={setPassword}
        />

        <PasswordInput
          id="password_confirmation"
          name="password_confirmation"
          label={t('passwordConfirmation')}
          required
          data-cy="registration-form-password-confirmation-input"
          autoComplete="new-password"
          isRequired
          validate={() => {
            if (passwordsDontMatch) {
              return t('validationError.passwordsDoNotMatch');
            }
            return true;
          }}
          value={passwordConfirmation ?? ''}
          onValueChange={setPasswordConfirmation}
        />

        <Button
          color="primary"
          fullWidth
          type="submit"
          endContent={<ArrowRight className="group-hover:translate-x-1 transition-transform" />}
          isLoading={isPending}
          isDisabled={!canSubmit}
          data-cy="registration-form-create-account-button"
        >
          {isPending ? t('creatingAccount') : t('createAccountButton')}
        </Button>
      </form>

      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        scrollBehavior="inside"
        data-cy="registration-form-success-modal"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                  <Mail className="h-6 w-6 text-green-600 dark:text-green-300" />
                </div>
                <div className="text-center">{t('success.title')}</div>
              </ModalHeader>
              <ModalBody>
                <p className="text-center text-gray-500 dark:text-gray-400">
                  {t('success.message').replace('{email}', registeredEmail)}
                </p>
                <Alert color="primary" variant="flat" title={t('twoFactor.title')} description={t('twoFactor.description')} />
              </ModalBody>
              <ModalFooter>
                <Button
                  variant="light"
                  onPress={onClose}
                  data-cy="registration-form-success-modal-close-button"
                >
                  {t('success.closeButton')}
                </Button>
                <Button
                  color="primary"
                  onPress={() => {
                    markTwoFactorSetupIntent();
                    onClose();
                    onHasAccount();
                  }}
                  data-cy="registration-form-success-modal-two-factor-button"
                >
                  {t('twoFactor.action')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
