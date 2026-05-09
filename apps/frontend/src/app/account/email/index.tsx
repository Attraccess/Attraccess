import { ApiError, useUsersServiceChangeMyEmail, useUsersServiceGetCurrentKey } from '@attraccess/react-query-client';
import { Button, Input } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useToastMessage } from '../../../components/toastProvider';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

export function EmailForm() {
  const { t } = useTranslations({ en, de });

  const [email, setEmail] = useState('');
  const queryClient = useQueryClient();
  const trimmedEmail = email.trim();
  const isEmailValid = trimmedEmail.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const { success: showSuccess, error: showError } = useToastMessage();

  const { mutate, isPending } = useUsersServiceChangeMyEmail({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [useUsersServiceGetCurrentKey],
      });
      showSuccess({ title: t('messages.updated') });
    },
    onError: (rawError) => {
      let messageToDisplay = t('errors.updateFailed');
      if (rawError instanceof ApiError) {
        const body = rawError.body as { message?: string | string[] } | undefined;
        const msg = Array.isArray(body?.message) ? body?.message[0] : body?.message;
        if (typeof msg === 'string' && msg.trim().length > 0) {
          messageToDisplay = msg;
        }
      } else if (rawError instanceof Error && rawError.message) {
        messageToDisplay = rawError.message;
      }
      showError({ title: messageToDisplay });
    },
  });

  const onSubmit = useCallback(() => {
    if (!isEmailValid) {
      return;
    }
    mutate({
      requestBody: { email: trimmedEmail },
    });
  }, [isEmailValid, mutate, trimmedEmail]);

  return (
    <div className="flex flex-col gap-4">
      <Input type="email" label={t('email.label')} value={email} onValueChange={setEmail} />
      <Button variant="primary" isPending={isPending} onPress={onSubmit} isDisabled={!isEmailValid || isPending}>
        {t('actions.save')}
      </Button>
    </div>
  );
}
