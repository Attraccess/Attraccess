import { ArrowRight, Mail } from 'lucide-react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Input,
  Label,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextField,
} from '@heroui/react';
import { Button } from '../../components/button';
import { StandardModal } from '../../components/standardModal';
import { UsernameInput, USERNAME_RULES } from '../../components/UsernameInput';
import { PasswordField } from '../../components/PasswordField';
import { RegisterFormProps } from './registrationForm.register-form-props';
import { useRegistrationFormState } from './useRegistrationFormState';

export function RegistrationForm({ onHasAccount }: RegisterFormProps) {
  const {
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
  } = useRegistrationFormState({ onHasAccount });

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

      <StandardModal isOpen={isOpen} onOpenChange={setOpen} data-cy="registration-form-success-modal" size="sm">
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
      </StandardModal>
    </>
  );
}
