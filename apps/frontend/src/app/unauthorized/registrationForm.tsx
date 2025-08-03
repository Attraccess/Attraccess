import React, { useCallback, useState } from 'react';
import { ArrowRight, Mail } from 'lucide-react';
import { Input } from '@heroui/input';
import { Button } from '@heroui/button';
import { Alert } from '@heroui/alert';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from '@heroui/modal';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PasswordInput } from '../../components/PasswordInput';
import * as en from './registrationForm.en.json';
import * as de from './registrationForm.de.json';
import { useUsersServiceCreateOneUser, UseUsersServiceFindManyKeyFn, ApiError } from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';

interface RegisterFormProps {
  onHasAccount: () => void;
}

export function RegistrationForm({ onHasAccount }: RegisterFormProps) {
  const { t } = useTranslations('register', {
    en,
    de,
  });

  const createUser = useUsersServiceCreateOneUser({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [UseUsersServiceFindManyKeyFn()[0]],
      });
    },
  });
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string>('');
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

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

      try {
        await createUser.mutateAsync({
          requestBody: {
            username,
            password,
            email,
            strategy: 'local_password',
          },
        });
        setRegisteredEmail(email);
        onOpen();
      } catch (rawError) {
        let messageToDisplay = t('error.generic');

        if (rawError instanceof ApiError) {
          const apiErrorBody = rawError.body as { message: string[] };

          if (apiErrorBody && Array.isArray(apiErrorBody.message) && apiErrorBody.message.length > 0) {
            const backendMsg = apiErrorBody.message[0] as string;
            if (
              backendMsg.includes('password') &&
              (backendMsg.includes('MinLength') || backendMsg.includes('longer than or equal to'))
            ) {
              messageToDisplay = t('error.passwordTooShort');
            } else {
              messageToDisplay = backendMsg;
            }
          } else if (apiErrorBody && typeof apiErrorBody.message === 'string') {
            messageToDisplay = apiErrorBody.message;
          }
        }

        setError(messageToDisplay);
      }
    },
    [createUser, onOpen, t]
  );

  return (
    <>
      <div>
        <h2 className="text-3xl font-bold">{t('title')}</h2>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          {t('hasAccount')}{' '}
          <Button
            onPress={onHasAccount}
            variant="light"
            color="secondary"
            isDisabled={createUser.isPending}
            data-cy="registration-form-sign-in-button"
          >
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
          isDisabled={createUser.isPending}
          data-cy="registration-form-username-input"
        />

        <Input
          id="email"
          name="email"
          type="email"
          label={t('email')}
          required
          variant="underlined"
          isDisabled={createUser.isPending}
          data-cy="registration-form-email-input"
        />

        <PasswordInput
          id="password"
          name="password"
          label={t('password')}
          required
          variant="underlined"
          isDisabled={createUser.isPending}
          data-cy="registration-form-password-input"
          autoComplete="new-password"
        />

        <PasswordInput
          id="password_confirmation"
          name="password_confirmation"
          label={t('passwordConfirmation')}
          required
          variant="underlined"
          isDisabled={createUser.isPending}
          data-cy="registration-form-password-confirmation-input"
          autoComplete="new-password"
        />

        <Button
          color="primary"
          fullWidth
          type="submit"
          endContent={<ArrowRight className="group-hover:translate-x-1 transition-transform" />}
          isLoading={createUser.isPending}
          isDisabled={createUser.isPending}
          data-cy="registration-form-create-account-button"
        >
          {createUser.isPending ? t('creatingAccount') : t('createAccountButton')}
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
