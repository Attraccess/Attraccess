import {
  ApiError,
  useUsersServiceChangeMyUsername,
  useUsersServiceGetCurrent,
  useUsersServiceGetCurrentKey,
} from '@attraccess/react-query-client';
import { Button, Input } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useToastMessage } from '../../../components/toastProvider';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

export function UsernameForm() {
  const { t } = useTranslations({ en, de });

  const { data: me, isLoading: isLoadingMe } = useUsersServiceGetCurrent();
  const [username, setUsername] = useState('');
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToastMessage();

  useEffect(() => {
    if (me?.username) setUsername(me.username);
  }, [me?.username]);

  const { mutate, isPending } = useUsersServiceChangeMyUsername({
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
          const lower = msg.toLowerCase();
          if (lower.includes('once per day')) {
            messageToDisplay = t('errors.oncePerDay');
          } else {
            messageToDisplay = msg;
          }
        }
      } else if (rawError instanceof Error && rawError.message) {
        messageToDisplay = rawError.message;
      }
      showError({ title: messageToDisplay });
    },
  });

  const onSubmit = useCallback(() => {
    mutate({
      requestBody: { username },
    });
  }, [mutate, username]);

  return (
    <div className="flex flex-col gap-4">
      <Input label={t('username.label')} value={username} onValueChange={setUsername} isDisabled={isLoadingMe} />
      <Button isLoading={isPending} onPress={onSubmit} color="primary">
        {t('actions.save')}
      </Button>
    </div>
  );
}
