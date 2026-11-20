import { ApiError, useChangeMyEmail, useGetCurrent, useGetCurrentKey } from '@attraccess/react-query-client';
import { Input, Label, TextField } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useToastMessage } from '../../../components/toastProvider';
import { ConfirmableButton, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

export function EmailForm() {
  const { t } = useTranslations({ en, de });

  const { data: me, isLoading: isLoadingMe } = useGetCurrent();
  const [email, setEmail] = useState('');
  const queryClient = useQueryClient();
  const trimmedEmail = email.trim();
  const isEmailValid = trimmedEmail.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const { success: showSuccess, error: showError } = useToastMessage();

  const { mutateAsync, isPending } = useChangeMyEmail(undefined, {
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [useGetCurrentKey],
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

  return (
    <div className="flex flex-col gap-4">
      <TextField value={me?.email ?? ''} isDisabled={isLoadingMe} isReadOnly>
        <Label>{t('email.currentLabel')}</Label>
        <Input type="email" />
      </TextField>
      <TextField value={email} onChange={setEmail}>
        <Label>{t('email.newLabel')}</Label>
        <Input type="email" />
      </TextField>
      <ConfirmableButton
        label={t('actions.save')}
        status="warning"
        buttonProps={{ variant: 'primary' }}
        isPending={isPending}
        isDisabled={!isEmailValid || isPending}
        confirm={{
          title: t('modal.title'),
          message: t('modal.warning'),
          confirmLabel: t('actions.confirm'),
          cancelLabel: t('actions.cancel'),
        }}
        onConfirm={() => mutateAsync({ body: { email: trimmedEmail } })}
      />
    </div>
  );
}
