import React, { useCallback, useState } from 'react';
import { Button, Card, CardHeader, CardBody, CardFooter } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../../components/toastProvider';
import { User, useUsersServiceSetUserPassword } from '@attraccess/react-query-client';
import { PageHeader } from '../../../../../components/pageHeader';
import { PasswordInput } from '../../../../../components/PasswordInput';

import * as en from './en.json';
import * as de from './de.json';

interface SetPasswordFormProps {
  user: User;
}

export const SetPasswordForm: React.FC<SetPasswordFormProps> = ({ user }) => {
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
  const [passwordsDontMatch, setPasswordsDontMatch] = useState(false);
  const [passwordTooShort, setPasswordTooShort] = useState(false);

  const handleSubmit = useCallback(() => {
    let valid = true;

    if (password !== confirmPassword) {
      setPasswordsDontMatch(true);
      valid = false;
    } else {
      setPasswordsDontMatch(false);
    }

    if (password.length < 8) {
      setPasswordTooShort(true);
      valid = false;
    } else {
      setPasswordTooShort(false);
    }

    if (!valid) {
      return;
    }

    setPasswordMutate({
      id: user.id,
      requestBody: { password },
    });
  }, [password, confirmPassword, setPasswordMutate, user]);

  return (
    <Card data-cy="set-password-form-card">
      <CardHeader>
        <PageHeader title={t('title')} noMargin />
      </CardHeader>

      <CardBody>
        <div className="flex flex-col gap-4">
          <PasswordInput
            label={t('newPassword')}
            value={password}
            onValueChange={setPassword}
            data-cy="set-password-form-new-password"
            errorMessage={passwordTooShort ? t('errors.passwordTooShort') : undefined}
            isInvalid={passwordTooShort}
          />

          <PasswordInput
            label={t('confirmPassword')}
            value={confirmPassword}
            onValueChange={setConfirmPassword}
            data-cy="set-password-form-confirm-password"
            errorMessage={passwordsDontMatch ? t('errors.passwordsDoNotMatch') : undefined}
            isInvalid={passwordsDontMatch}
          />
        </div>
      </CardBody>

      <CardFooter className="flex justify-end">
        <Button
          color="primary"
          onPress={handleSubmit}
          isLoading={isSettingPassword}
          data-cy="set-password-form-save-button"
        >
          {t('actions.setPassword')}
        </Button>
      </CardFooter>
    </Card>
  );
};
