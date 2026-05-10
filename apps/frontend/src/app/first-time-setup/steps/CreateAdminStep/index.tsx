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
import { PasswordInput } from '../../../../components/PasswordInput';
import { UsernameInput, USERNAME_RULES, useUsernameValidation } from '../../../../components/UsernameInput';
import { useToastMessage } from '../../../../components/toastProvider';
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
  const [password, setPassword] = useState<string | null>(null);
  const [passwordConfirmation, setPasswordConfirmation] = useState<string | null>(null);

  const passwordsDontMatch = useMemo(
    () =>
      password !== null &&
      passwordConfirmation !== null &&
      password !== passwordConfirmation,
    [password, passwordConfirmation],
  );
  const passwordTooShort = useMemo(
    () => password !== null && password.length < 8,
    [password],
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
      password !== null &&
      passwordConfirmation !== null &&
      !passwordTooShort &&
      !passwordsDontMatch,
    [
      isUsernameValid,
      trimmedEmail,
      password,
      passwordConfirmation,
      passwordTooShort,
      passwordsDontMatch,
    ],
  );

  const { mutate: createUser, isPending } = useUsersServiceCreateOneUser({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: UseUsersServiceFindManyKeyFn() });
      queryClient.invalidateQueries({ queryKey: UseSettingsServiceGetFirstTimeSetupStatusKeyFn() });
      onSuccess?.();
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

  const handleSubmit = useCallback(() => {
    if (!formRef.current?.checkValidity() || !canSubmit || password === null) return;
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
        <PasswordInput
          label={t('password')}
          value={password ?? ''}
          onChange={(v) => setPassword(v || null)}
          autoComplete="new-password"
          isRequired
          validate={() =>
            passwordTooShort ? t('validationError.passwordTooShort') : true
          }
        />
        <PasswordInput
          label={t('passwordConfirmation')}
          value={passwordConfirmation ?? ''}
          onChange={(v) => setPasswordConfirmation(v || null)}
          autoComplete="new-password"
          isRequired
          validate={() =>
            passwordsDontMatch ? t('validationError.passwordsDoNotMatch') : true
          }
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
