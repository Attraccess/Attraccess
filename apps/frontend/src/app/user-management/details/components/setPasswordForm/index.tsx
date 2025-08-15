import React, { HTMLAttributes, useCallback, useMemo, useState } from 'react';
import { Button, cn } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../../components/toastProvider';
import { useUsersServiceSetUserPassword } from '@attraccess/react-query-client';
import { PasswordInput } from '../../../../../components/PasswordInput';

import * as en from './en.json';
import * as de from './de.json';

interface SetPasswordFormProps {
  userId: number;
}

export const SetPasswordForm: React.FC<SetPasswordFormProps & Omit<HTMLAttributes<HTMLDivElement>, 'children'>> = ({
  userId,
  ...divProps
}) => {
  const { t } = useTranslations('setPasswordForm', { en, de });
  const { showToast } = useToastMessage();
  const { mutate: setPasswordMutate, isPending: isSettingPassword } = useUsersServiceSetUserPassword({
    onSuccess: () => {
      showToast({
        title: t('passwordUpdated'),
        type: 'success',
      });

      // Reset form
      setPassword('');
      setConfirmPassword('');
    },
    onError: (error) => {
      console.error('Error setting password:', error);
      showToast({
        title: t('errorUpdatingPassword'),
        type: 'error',
      });
    },
  });

  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const passwordWasEntered = useMemo(() => {
    return password.length > 0 || confirmPassword.length > 0;
  }, [password, confirmPassword]);

  const passwordTooShort = useMemo(() => {
    return password.length < 8;
  }, [password]);

  const passwordsDontMatch = useMemo(() => {
    return password !== confirmPassword;
  }, [password, confirmPassword]);

  const handleSubmit = useCallback(() => {
    setPasswordMutate({
      id: userId,
      requestBody: { password },
    });
  }, [password, setPasswordMutate, userId]);

  return (
    <div {...divProps} className={cn(divProps.className, 'flex flex-col gap-4')}>
      <PasswordInput
        label={t('newPassword')}
        value={password}
        onValueChange={setPassword}
        data-cy="set-password-form-new-password"
        errorMessage={t('errors.passwordTooShort')}
        isInvalid={passwordTooShort && passwordWasEntered}
        autoComplete="new-password"
      />

      <PasswordInput
        label={t('confirmPassword')}
        value={confirmPassword}
        onValueChange={setConfirmPassword}
        data-cy="set-password-form-confirm-password"
        errorMessage={t('errors.passwordsDoNotMatch')}
        isInvalid={passwordsDontMatch && passwordWasEntered}
        autoComplete="new-password"
      />

      <div className="flex w-full justify-end">
        <Button
          color="primary"
          onPress={handleSubmit}
          isLoading={isSettingPassword}
          data-cy="set-password-form-save-button"
          isDisabled={passwordTooShort || passwordsDontMatch}
        >
          {t('actions.setPassword')}
        </Button>
      </div>
    </div>
  );
};
