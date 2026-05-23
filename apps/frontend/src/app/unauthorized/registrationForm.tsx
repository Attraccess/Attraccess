import React, { useCallback, useMemo, useState } from 'react';
import { ArrowRight, Mail } from 'lucide-react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
  Label,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  TextField,
  useOverlayState,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { UsernameInput, USERNAME_RULES, useUsernameValidation } from '../../components/UsernameInput';
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
import { PasswordField } from '../../components/PasswordField';
import { PolicyError, PublicPasswordPolicy, validatePassword } from '@attraccess/shared';
import { extractPolicyErrors } from '../../utils/policyErrors';

interface RegisterFormProps {
  onHasAccount: () => void;
}

const FALLBACK_POLICY: PublicPasswordPolicy = {
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
          {isPending ? t('creatingAccount') : t('createAccountButton')}
          <ArrowRight className="group-hover:translate-x-1 transition-transform" />
        </Button>
      </form>

      <Modal isOpen={isOpen} onOpenChange={setOpen} data-cy="registration-form-success-modal">
        <ModalBackdrop>
          <ModalContainer size="sm">
            <ModalDialog>
              {({ close }) => (
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
                    <Alert status="default">
                      <AlertContent>
                        <AlertTitle>{t('twoFactor.title')}</AlertTitle>
                        <AlertDescription>{t('twoFactor.description')}</AlertDescription>
                      </AlertContent>
                    </Alert>
                  </ModalBody>
                  <ModalFooter>
                    <Button variant="ghost" onPress={close} data-cy="registration-form-success-modal-close-button">
                      {t('success.closeButton')}
                    </Button>
                    <Button
                      variant="primary"
                      onPress={() => {
                        markTwoFactorSetupIntent();
                        close();
                        onHasAccount();
                      }}
                      data-cy="registration-form-success-modal-two-factor-button"
                    >
                      {t('twoFactor.action')}
                    </Button>
                  </ModalFooter>
                </>
              )}
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    </>
  );
}
