import {
  useUsersServiceChangeUserUsername,
  useUsersServiceFindManyKey,
  useUsersServiceGetAllWithPermissionKey,
  useUsersServiceGetOneUserById,
  useUsersServiceGetOneUserByIdKey,
} from '@attraccess/react-query-client';
import { Button, cn, Input } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { HTMLAttributes, useCallback, useEffect, useState } from 'react';

import de from './de.json';
import en from './en.json';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../../components/toastProvider';
import { ApiError } from '@attraccess/react-query-client';

interface Props {
  userId: number;
}

export function ChangeUsernameForm({ userId, ...divProps }: Props & Omit<HTMLAttributes<HTMLDivElement>, 'children'>) {
  const [username, setUsername] = useState('');
  const queryClient = useQueryClient();

  const { t } = useTranslations({ en, de });
  const { success: showSuccess, error: showError } = useToastMessage();

  const { data: user, isLoading: isLoadingUser } = useUsersServiceGetOneUserById({ id: userId });

  useEffect(() => {
    if (user) {
      setUsername(user.username);
    }
  }, [user]);

  const { mutate, isPending } = useUsersServiceChangeUserUsername({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [useUsersServiceGetOneUserByIdKey],
      });
      queryClient.invalidateQueries({
        queryKey: [useUsersServiceGetAllWithPermissionKey],
      });
      queryClient.invalidateQueries({
        queryKey: [useUsersServiceFindManyKey],
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
      id: userId,
      requestBody: {
        username,
      },
    });
  }, [mutate, username, userId]);

  return (
    <div {...divProps} className={cn(divProps.className, 'flex flex-col gap-4')}>
      <Input label={t('username.label')} value={username} onValueChange={setUsername} isDisabled={isLoadingUser} />
      <div className="flex w-full justify-end">
        <Button isLoading={isPending} onPress={onSubmit} color="primary">
          {t('actions.save')}
        </Button>
      </div>
    </div>
  );
}
