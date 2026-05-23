import { useCallback, useMemo, useRef, useState } from 'react';
import { Button, Form, TextField, Label, Input } from '@heroui/react';
import { UserPlusIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  useUsersServiceCreateOneUser,
  UseUsersServiceFindManyKeyFn,
  UseSettingsServiceGetFirstTimeSetupStatusKeyFn,
  ApiError,
  AuthenticationType,
} from '@attraccess/react-query-client';
import { PageHeader } from '../../../../components/pageHeader';
import { PasswordField } from '../../../../components/PasswordField';
import { UsernameInput, USERNAME_RULES, useUsernameValidation } from '../../../../components/UsernameInput';
import { useToastMessage } from '../../../../components/toastProvider';
import { PolicyError } from '@attraccess/shared';
import { extractPolicyErrors } from '../../../../utils/policyErrors';
import API_ERROR_TRANSLATIONS_DE from '../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../global-translations/api-errors.en.json';
import en from './en.json';
import de from './de.json';

export type CreateAdminStepProps = {
  onSuccess?: () => void;
  isOverwrite?: boolean;
};

export function CreateAdminStep({ onSuccess, isOverwrite }: CreateAdminStepProps) {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [serverErrors, setServerErrors] = useState<PolicyError[]>([]);

  const passwordsDontMatch = useMemo(
    () => password.length > 0 && passwordConfirmation.length > 0 && password !== passwordConfirmation,
    [password, passwordConfirmation],
  );

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
      password.length > 0 &&
      passwordConfirmation.length > 0 &&
      !passwordsDontMatch,
    [isUsernameValid, trimmedEmail, password, passwordConfirmation, passwordsDontMatch],
  );

  const { mutate: createUser, isPending } = useUsersServiceCreateOneUser({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: UseUsersServiceFindManyKeyFn() });
      queryClient.invalidateQueries({ queryKey: UseSettingsServiceGetFirstTimeSetupStatusKeyFn() });
      setServerErrors([]);
      onSuccess?.();
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

  const handleSubmit = useCallback(() => {
    if (!formRef.current?.checkValidity() || !canSubmit) return;
    setServerErrors([]);
    createUser({
      requestBody: {
        username: trimmedUsername,
        email: trimmedEmail,
        password,
        strategy: AuthenticationType.LOCAL_PASSWORD,
        ...(isOverwrite ? { overwriteFirstTimeAdmin: true } : {}),
      },
    });
  }, [canSubmit, createUser, isOverwrite, password, trimmedEmail, trimmedUsername]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<UserPlusIcon size={18} />}
        noMargin
      />
      <Form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <UsernameInput
          label={t('username')}
          description={t('usernameDescription', {
            min: USERNAME_RULES.minLength,
            max: USERNAME_RULES.maxLength,
          })}
          validationMessages={usernameValidationMessages}
          value={username}
          onChange={setUsername}
          isRequired
        />
        <TextField value={email} onChange={setEmail} isRequired>
          <Label>{t('email')}</Label>
          <Input type="email" />
        </TextField>
        <PasswordField
          value={password}
          onValueChange={(v) => {
            setPassword(v);
            setServerErrors([]);
          }}
          username={trimmedUsername}
          email={trimmedEmail}
          serverErrors={serverErrors}
          passwordLabel={t('password')}
          confirmationLabel={t('passwordConfirmation')}
          showConfirmation
          confirmationValue={passwordConfirmation}
          onConfirmationChange={setPasswordConfirmation}
          isRequired
          autoComplete="new-password"
          dataCyPrefix="create-admin"
        />
        <input type="submit" hidden />
      </Form>
      <Button variant="primary"
        onPress={handleSubmit}
        isPending={isPending}
        isDisabled={!canSubmit}
      >
        {isPending ? t('creating') : t('actions.create')}
      </Button>
    </div>
  );
}
