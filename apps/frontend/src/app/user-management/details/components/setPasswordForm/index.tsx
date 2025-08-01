
import React, { useState } from 'react';
import { Button, Card, CardHeader, CardBody, CardFooter, Input } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../../components/toastProvider';
import { User, useUsersServiceSetUserPassword } from '@attraccess/react-query-client';
import { PageHeader } from '../../../../../components/pageHeader';

import * as en from './en.json';
import * as de from './de.json';

interface SetPasswordFormProps {
  user: User;
}

export const SetPasswordForm: React.FC<SetPasswordFormProps> = ({ user }) => {
  const { t } = useTranslations('setPasswordForm', { en, de });
  const { showToast } = useToastMessage();
  const setUserPassword = useUsersServiceSetUserPassword();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    
    if (password !== confirmPassword) {
      setError(t('errors.passwordsDoNotMatch'));
      return;
    }

    if (password.length < 8) {
      setError(t('errors.passwordTooShort'));
      return;
    }

    try {
      await setUserPassword.mutateAsync({
        id: user.id,
        requestBody: { password },
      });

      showToast({
        title: t('passwordUpdated'),
        type: 'success',
      });

      // Reset form
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('Error setting password:', error);
      showToast({
        title: t('errorUpdatingPassword'),
        type: 'error',
      });
    }
  };

  return (
    <Card data-cy="set-password-form-card">
      <CardHeader>
        <PageHeader title={t('title')} noMargin />
      </CardHeader>

      <CardBody>
        <div className="flex flex-col gap-4">
          <Input
            type="password"
            label={t('newPassword')}
            value={password}
            onValueChange={setPassword}
            data-cy="set-password-form-new-password"
          />
          
          <Input
            type="password"
            label={t('confirmPassword')}
            value={confirmPassword}
            onValueChange={setConfirmPassword}
            data-cy="set-password-form-confirm-password"
          />
          
          {error && (
            <div className="text-danger text-sm" data-cy="set-password-form-error">
              {error}
            </div>
          )}
        </div>
      </CardBody>

      <CardFooter className="flex justify-end">
        <Button
          color="primary"
          onPress={handleSubmit}
          isLoading={setUserPassword.isPending}
          data-cy="set-password-form-save-button"
        >
          {t('actions.setPassword')}
        </Button>
      </CardFooter>
    </Card>
  );
};
