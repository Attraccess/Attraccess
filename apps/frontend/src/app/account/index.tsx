import { PageHeader } from '../../components/pageHeader';
import { Card, CardBody, Button, Input } from '@heroui/react';
import {
  useUsersServiceChangeMyUsername,
  useUsersServiceGetCurrent,
  useUsersServiceGetCurrentKey,
  ApiError,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useToastMessage } from '../../components/toastProvider';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import * as en from './translations/en.json';
import * as de from './translations/de.json';

export default function AccountPage() {
  const { t } = useTranslations('account', { en, de });
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
    <div>
      <PageHeader title="Account" backTo="/" />
      <Card className="max-w-md">
        <CardBody className="flex gap-2">
          <Input label="Username" value={username} onValueChange={setUsername} isDisabled={isLoadingMe} />
          <Button isLoading={isPending} onPress={onSubmit} color="primary">
            Save
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
