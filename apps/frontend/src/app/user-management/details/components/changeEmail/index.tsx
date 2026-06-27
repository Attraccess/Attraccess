import {
  UseUsersServiceGetOneUserByIdKeyFn,
  useUsersServiceChangeUserEmail,
  useUsersServiceFindManyKey,
} from '@attraccess/react-query-client';
import { cn, TextField, Label, Input } from '@heroui/react';
import { Button } from '../../../../../components/button';
import { useQueryClient } from '@tanstack/react-query';
import { HTMLAttributes, useCallback, useState } from 'react';

import de from './de.json';
import en from './en.json';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../../components/toastProvider';
import { ApiError } from '@attraccess/react-query-client';

interface Props {
  userId: number;
}

export function ChangeEmailForm({ userId, ...divProps }: Props & Omit<HTMLAttributes<HTMLDivElement>, 'children'>) {
  const [email, setEmail] = useState('');
  const queryClient = useQueryClient();
  const trimmedEmail = email.trim();
  const isEmailValid = trimmedEmail.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);

  const { t } = useTranslations({ en, de });
  const { success: showSuccess, error: showError } = useToastMessage();

  const { mutate, isPending } = useUsersServiceChangeUserEmail({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: UseUsersServiceGetOneUserByIdKeyFn({ id: userId }),
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
      id: userId,
      requestBody: {
        email: trimmedEmail,
      },
    });
  }, [isEmailValid, mutate, trimmedEmail, userId]);

  return (
    <div {...divProps} className={cn(divProps.className, 'flex flex-col gap-4')}>
      <TextField value={email} onChange={setEmail}>
        <Label>{t('email.label')}</Label>
        <Input type="email" />
      </TextField>
      <div className="flex w-full justify-end">
        <Button variant="primary" isPending={isPending} onPress={onSubmit} isDisabled={!isEmailValid || isPending}>
          {t('actions.save')}
        </Button>
      </div>
    </div>
  );
}
