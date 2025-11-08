import React, { useCallback, useState } from 'react';
import { ArrowRight, Mail } from 'lucide-react';
import { Input } from '@heroui/react';
import { Button } from '@heroui/react';
import { Alert } from '@heroui/react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PasswordInput } from '../../components/PasswordInput';
import en from './registrationForm.en.json';
import de from './registrationForm.de.json';
import { useUsersServiceCreateOneUser, UseUsersServiceFindManyKeyFn, ApiError } from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { getTranslationKeyForApiError } from '../../utils/apiError';

interface RegisterFormProps {
  onHasAccount: () => void;
}

export function RegistrationForm({ onHasAccount }: RegisterFormProps) {
  const { t, tExists } = useTranslations({
    en,
    de,
  });

  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string>('');
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  const { mutate: createUserMutate, isPending } = useUsersServiceCreateOneUser({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [UseUsersServiceFindManyKeyFn()[0]],
      });
      onOpen();
    },
    onError: (error) => {
      const { key, errorMessage } = getTranslationKeyForApiError({
        error: error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'error',
        fallbackKey: 'generic',
      });

      setError(t(key, { error: errorMessage }));
    },
  });

  const handleSubmit: React.FormEventHandler = useCallback(
    async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget as HTMLFormElement);
      const username = formData.get('username');
      const password = formData.get('password');
      const passwordConfirmation = formData.get('password_confirmation');
      const email = formData.get('email');

      if (password !== passwordConfirmation) {
        setError(t('passwordConfirmationError'));
        return;
      }

      if (typeof username !== 'string' || typeof password !== 'string' || typeof email !== 'string') {
        return;
      }

      setRegisteredEmail(email);
      createUserMutate({
        requestBody: {
          username,
          password,
          email,
          strategy: 'local_password',
        },
      });
    },
    [createUserMutate, t],
  );

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
        <Input
          id="username"
          name="username"
          type="text"
          label={t('username')}
          required
          variant="underlined"
          data-cy="registration-form-username-input"
        />

        <Input
          id="email"
          name="email"
          type="email"
          label={t('email')}
          required
          variant="underlined"
          data-cy="registration-form-email-input"
        />

        <PasswordInput
          id="password"
          name="password"
          label={t('password')}
          required
          variant="underlined"
          data-cy="registration-form-password-input"
          autoComplete="new-password"
        />

        <PasswordInput
          id="password_confirmation"
          name="password_confirmation"
          label={t('passwordConfirmation')}
          required
          variant="underlined"
          data-cy="registration-form-password-confirmation-input"
          autoComplete="new-password"
        />

        <Button
          color="primary"
          fullWidth
          type="submit"
          endContent={<ArrowRight className="group-hover:translate-x-1 transition-transform" />}
          isLoading={isPending}
          data-cy="registration-form-create-account-button"
        >
          {isPending ? t('creatingAccount') : t('createAccountButton')}
        </Button>

        {error && (
          <Alert color="danger" title={t('error.title')} description={error} data-cy="registration-form-error-alert" />
        )}
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
              </ModalBody>
              <ModalFooter>
                <Button
                  color="primary"
                  fullWidth
                  onPress={onClose}
                  data-cy="registration-form-success-modal-close-button"
                >
                  {t('success.closeButton')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
