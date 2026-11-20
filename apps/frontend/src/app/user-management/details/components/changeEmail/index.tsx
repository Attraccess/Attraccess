import { UseGetOneUserByIdKeyFn, useChangeUserEmail, useFindManyKey } from '@attraccess/react-query-client';
import { cn, Input, Label, TextField } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { HTMLAttributes, useCallback, useState } from 'react';

import de from './de.json';
import en from './en.json';
import { ConfirmableButton, useTranslations } from '@attraccess/plugins-frontend-ui';
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

  const { mutateAsync, isPending } = useChangeUserEmail(undefined, {
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: UseGetOneUserByIdKeyFn({ path: { id: userId } }),
      });
      queryClient.invalidateQueries({
        queryKey: [useFindManyKey],
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

  const confirmEmailChange = useCallback(
    () =>
      mutateAsync({
        path: { id: userId },
        body: {
          email: trimmedEmail,
        },
      }),
    [mutateAsync, trimmedEmail, userId],
  );

  return (
    <div {...divProps} className={cn(divProps.className, 'flex flex-col gap-4')}>
      <TextField value={email} onChange={setEmail}>
        <Label>{t('email.label')}</Label>
        <Input type="email" />
      </TextField>
      <p className="text-sm text-default-500">{t('email.privacyHint')}</p>
      <div className="flex w-full justify-end">
        <ConfirmableButton
          label={t('actions.save')}
          status="warning"
          isPending={isPending}
          isDisabled={!isEmailValid || isPending}
          buttonProps={{ variant: 'primary' }}
          confirm={{
            title: t('modal.title'),
            message: t('modal.warning'),
            confirmLabel: t('actions.confirm'),
            cancelLabel: t('actions.cancel'),
          }}
          onConfirm={confirmEmailChange}
        />
      </div>
    </div>
  );
}
