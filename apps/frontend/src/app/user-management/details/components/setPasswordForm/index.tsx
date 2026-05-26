import React, { HTMLAttributes, useCallback, useMemo, useState } from 'react';
import { cn } from '@heroui/react';
import { Button } from '../../../../../components/button';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../../components/toastProvider';
import { useUsersServiceSetUserPassword } from '@attraccess/react-query-client';
import { PasswordField } from '../../../../../components/PasswordField';
import { PolicyError } from '@attraccess/shared';
import { extractPolicyErrors } from '../../../../../utils/policyErrors';

import en from './en.json';
import de from './de.json';

interface SetPasswordFormProps {
  userId: number;
  username?: string;
  email?: string;
}

export const SetPasswordForm: React.FC<SetPasswordFormProps & Omit<HTMLAttributes<HTMLDivElement>, 'children'>> = ({
  userId,
  username,
  email,
  ...divProps
}) => {
  const { t } = useTranslations({ en, de });
  const { showToast } = useToastMessage();

  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [serverErrors, setServerErrors] = useState<PolicyError[]>([]);

  const { mutate: setPasswordMutate, isPending: isSettingPassword } = useUsersServiceSetUserPassword({
    onSuccess: () => {
      showToast({
        title: t('passwordUpdated'),
        type: 'success',
      });
      setPassword('');
      setConfirmPassword('');
      setServerErrors([]);
    },
    onError: (error) => {
      const policyErrors = extractPolicyErrors(error);
      if (policyErrors) {
        setServerErrors(policyErrors);
        return;
      }
      setServerErrors([]);
      showToast({
        title: t('errorUpdatingPassword'),
        type: 'error',
      });
    },
  });

  const passwordsDontMatch = useMemo(() => password !== confirmPassword, [password, confirmPassword]);
  const passwordEntered = useMemo(() => password.length > 0 && confirmPassword.length > 0, [password, confirmPassword]);

  const handleSubmit = useCallback(() => {
    setServerErrors([]);
    setPasswordMutate({
      id: userId,
      requestBody: { password },
    });
  }, [password, setPasswordMutate, userId]);

  return (
    <div {...divProps} className={cn(divProps.className, 'flex flex-col gap-4')}>
      <PasswordField
        value={password}
        onValueChange={(v) => {
          setPassword(v);
          setServerErrors([]);
        }}
        username={username}
        email={email}
        serverErrors={serverErrors}
        passwordLabel={t('newPassword')}
        confirmationLabel={t('confirmPassword')}
        showConfirmation
        confirmationValue={confirmPassword}
        onConfirmationChange={setConfirmPassword}
        isRequired
        autoComplete="new-password"
        dataCyPrefix="set-password-form"
      />

      <div className="flex w-full justify-end">
        <Button variant="primary"
          onPress={handleSubmit}
          isPending={isSettingPassword}
          data-cy="set-password-form-save-button"
          isDisabled={!passwordEntered || passwordsDontMatch}
        >
          {t('actions.setPassword')}
        </Button>
      </div>
    </div>
  );
};
